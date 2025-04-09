import { ServerConfig, Server } from "@niledatabase/server";
import dotenv from "dotenv";

const { parsed } = dotenv.config({ path: "./test/.env" });

const url = new URL(String(parsed?.NILEDB_POSTGRES_URL));
const config: ServerConfig = {
  debug: true,
  user: parsed?.NILEDB_USER,
  password: parsed?.NILEDB_PASSWORD,
  db: {
    host: url.hostname,
    port: Number(url.port),
  },
  databaseName: url.pathname.slice(1),
};

const primaryUser = {
  email: "delete@me.com",
  password: "deleteme",
};
const newUser = {
  email: "delete2@me.com",
  password: "deleteme",
};
const tenantUser = {
  email: "delete3@me.com",
  password: "deleteme",
};

describe("api integration", () => {
  test("does api calls for the api sdk", async () => {
    const nile = new Server(config);
    // debugging clean up
    await initialDebugCleanup(nile);

    // create 2 users, one primary, the other one to add to a tenant manually later
    const [user, secondUser] = await Promise.all([
      nile.api.users.createUser(primaryUser) as unknown as {
        id: string;
        name: string;
      },
      nile.api.users.createUser(newUser) as unknown as { id: string },
    ]);

    expect(user.id).toBeTruthy();

    await nile.api.login(primaryUser);

    const me = await nile.api.users.me<{ email: string }>();
    expect(me.email).toEqual(primaryUser.email);

    // Updating session user
    expect(user.name).toEqual(null);
    const update = {
      name: "updatedName",
    };
    const updatedFirstUser = await nile.api.users.updateMe(update);

    expect(updatedFirstUser).toMatchObject({
      name: update.name,
      tenants: [], // not in a tenant, yet.
    });

    // add a tenant, be sure user is in tenant
    const newTenant = (await nile.api.tenants.createTenant("betterName")) as {
      id: string;
      name: string;
    };
    expect(newTenant.name).toEqual("betterName");

    // be sure the tenant we get is the tenant we got
    const checkTenant = (await nile.api.tenants.getTenant(newTenant.id)) as {
      id: string;
    };
    expect(checkTenant.id).toEqual(newTenant.id);

    // be sure the session user is assigned to the created tenant
    const checkMeUpdate = await nile.api.users.me();
    expect(checkMeUpdate).toMatchObject({ tenants: [{ id: newTenant.id }] });

    // contextualize the remaining queries
    nile.tenantId = newTenant.id;

    // rename tenant
    const updated = (await nile.api.tenants.updateTenant({
      name: "betterNameAgain",
    })) as { name: string };
    expect(updated.name).toEqual("betterNameAgain");

    // create a user directly on the tenant
    const newTenantUser = (await nile.api.users.createTenantUser(
      tenantUser,
    )) as { id: string; name?: null | string };
    expect(newTenantUser).toMatchObject({ email: tenantUser.email });

    // update that user as a member of that tenant, then remove them
    expect(newTenantUser.name).toBeNull();
    nile.userId = secondUser.id;
    const tuUpdates = { name: "fake name" };
    const updatedTu = (await nile.api.users.updateUser(tuUpdates)) as {
      name: string;
    };
    expect(updatedTu.name).not.toBeNull();
    expect(updatedTu.name).toEqual(tuUpdates.name);
    await nile.api.users.unlinkUser(newTenantUser.id);

    // manually link the 2nd user to the tenant
    const linked = (await nile.api.users.linkUser(secondUser.id)) as {
      id: string;
    };
    expect(linked.id).toEqual(secondUser.id);

    // double check the list of users
    const listOfUsers = (await nile.api.users.listUsers()) as [];
    expect(listOfUsers.length).toEqual(2);
    const unlinked = await nile.api.users.unlinkUser(secondUser.id);
    expect(unlinked.status).toEqual(204);
    const remainingUsers = (await nile.api.users.listUsers()) as [];
    expect(remainingUsers.length).toEqual(1);

    // can't update the user again, they are not in my tenant
    const tuUpdates2 = { name: "name" };
    const updatedTu2 = (await nile.api.users.updateUser(tuUpdates2)) as {
      name: string;
    };
    expect(updatedTu2.name).toEqual(tuUpdates2.name);

    // just marks it for deletion, will actually get deleted in clean up
    const removedTenant = await nile.api.tenants.deleteTenant();
    expect(removedTenant.status).toEqual(204);

    // be sure the primary user has no tenants (they are deleted)
    const recheckMe = (await nile.api.users.me()) as unknown as { tenants: [] };
    expect(recheckMe.tenants.length).toEqual(0);

    // clean up
    nile.tenantId = "";

    for (const id of [user.id, secondUser.id, newTenantUser.id]) {
      await nile.db.query("delete from auth.credentials where user_id = $1", [
        id,
      ]);
      await nile.db.query("delete from users.users where id = $1", [id]);
    }

    await nile.db.query("delete from users.tenant_users where tenant_id = $1", [
      newTenant.id,
    ]);
    await nile.db.query("delete from tenants where id = $1", [newTenant.id]);
    await nile.clearConnections();
  }, 10000);
});

async function initialDebugCleanup(nile: Server) {
  // remove the users 1st, fk constraints
  const existing = [primaryUser, newUser, tenantUser].map(async (u) => {
    const exists = await nile.db.query(
      "select * from users.users where email = $1",
      [u.email],
    );
    if (exists.rows.length > 0) {
      const id = exists.rows[0].id;
      await nile.db.query("delete from auth.credentials where user_id = $1", [
        id,
      ]);
      await nile.db.query("delete from users.users where id= $1", [id]);
    }
  });
  await Promise.all(existing);
  const tenants = await nile.db.query("select * from tenants;");
  const commands = tenants.rows.reduce((accum, t) => {
    if (!t.name || t.name?.includes("betterName")) {
      accum.push(
        nile.db.query("delete from users.tenant_users where tenant_id = $1", [
          t.id,
        ]),
      );
      accum.push(nile.db.query("delete from tenants where id = $1", [t.id]));
    }
    return accum;
  }, []);
  try {
    await Promise.all(commands);
  } catch (e) {
    await Promise.resolve();
  }
}
