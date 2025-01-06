export default function Credentials({
  form,
  setForm,
}: {
  form: any;
  setForm: any;
}) {
  if (form.provider !== "creds") {
    return (
      <div>
        <button
          onClick={(e) => {
            e.preventDefault();
            setForm((f: any) => {
              return { ...f, provider: "creds" };
            });
          }}
        >
          show creds
        </button>
      </div>
    );
  }
  return (
    <div className="form-wrapper">
      <div>
        <button
          onClick={(e) => {
            e.preventDefault();
            setForm((f: any) => {
              return { ...f, provider: "" };
            });
          }}
        >
          hide creds
        </button>
      </div>

      <div className="text-lg">Credentials</div>
      <div style={{ marginBottom: "1rem" }}>
        Submitting this form will create a new user for your database, based on
        the credentials provided by{" "}
        <a href="https://console.thenile.dev">console.thenile.dev</a>
      </div>
      <div className="flex flex-col">
        <label>User email</label>
        <input
          name="email"
          value={form.email}
          onChange={(e) =>
            setForm((state: any) => ({
              ...state,
              email: e.target.value,
            }))
          }
        />
      </div>
      <div className="flex flex-col">
        <label>User password</label>
        <input
          name="password"
          type="password"
          value={form.password}
          onChange={(e) =>
            setForm((state: any) => ({
              ...state,
              password: e.target.value,
            }))
          }
        />
      </div>
      <div>
        <button
          style={{ marginTop: "1rem" }}
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            // doing this manually, @niledatabase/react handles this automatically
            await fetch(`/v2/databases/${form.database}/auth/csrf`, {
              headers: { "niledb-origin": window.location.origin },
            });
            await fetch(`/v2/databases/${form.database}/signup`, {
              method: "POST",
              body: JSON.stringify(form),
              headers: { "niledb-origin": window.location.origin },
            });
            window.location.search = new URLSearchParams(form).toString();
          }}
        >
          Sign up
        </button>
        <button
          style={{ marginTop: "1rem", marginLeft: "1rem" }}
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            // doing this manually, @niledatabase/react handles this automatically
            const token = await fetch(
              `/v2/databases/${form.database}/auth/csrf`,
              {
                headers: { "niledb-origin": window.location.origin },
              },
            );

            const { csrfToken } = await token.json();

            await fetch(
              `/v2/databases/${form.database}/auth/callback/credentials`,
              {
                method: "POST",
                body: new URLSearchParams({
                  ...form,
                  csrfToken,
                  callbackUrl: window.location.href,
                  json: "true",
                }),
                headers: {
                  "niledb-origin": window.location.origin,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
              },
            );
            window.location.search = new URLSearchParams(form).toString();
          }}
        >
          Sign in
        </button>
      </div>
    </div>
  );
}
