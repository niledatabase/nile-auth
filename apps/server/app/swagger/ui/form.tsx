"use client";

import { useEffect, useState } from "react";

function filler(obj: Record<string, string>) {
  return {
    developerUser: "",
    developerPassword: "",
    email: "",
    password: "",
    database: "",
    host: "",
    port: "",
    ...obj,
  };
}
export function Form() {
  const [form, setForm] = useState({
    developerUser: "0192fd0c-eb4b-7b8b-bcf4-91b66fad42c2",
    developerPassword: "f5a0eacc-fd44-4deb-82a0-29eeb0908158",
    email: "desert@world.com",
    password: "desert@world.com",
    database: "clever_washer",
    host: "us-west-2.db.dev.thenile.dev",
    port: "5432",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const obj = Object.fromEntries(params.entries());
    setForm(filler(obj));
  }, []);

  return (
    <div>
      <div className="form-content">
        <div className="form-wrapper">
          <div style={{ marginBottom: "1rem" }}>
            Obtain these credentials from{" "}
            <a href="https://console.thenile.dev">console.thenile.dev</a>
            <br />
            <br />
          </div>
          <label>Database name</label>
          <input
            value={form.database}
            onChange={(e) =>
              setForm((state) => ({
                ...state,
                database: e.target.value,
              }))
            }
            name="database"
          />
          <label>NileDB user</label>
          <input
            value={form.developerUser}
            onChange={(e) =>
              setForm((state) => ({
                ...state,
                developerUser: e.target.value,
              }))
            }
            name="developer_user"
          />
          <label>NileDB password</label>
          <input
            value={form.developerPassword}
            onChange={(e) =>
              setForm((state) => ({
                ...state,
                host: e.target.value,
              }))
            }
            name="developer_password"
            type="password"
          />
          <label>NileDB host</label>
          <input
            value={form.host}
            onChange={(e) =>
              setForm((state) => ({
                ...state,
                host: e.target.value,
              }))
            }
            name="host"
          />
          <label>NileDB port</label>
          <input
            value={form.port}
            onChange={(e) =>
              setForm((state) => ({
                ...state,
                port: e.target.value,
              }))
            }
            name="port"
          />
        </div>
        <div className="form-wrapper">
          <div style={{ marginBottom: "1rem" }}>
            Submitting this form will create a new user for your database, based
            on the credentials provided by{" "}
            <a href="https://console.thenile.dev">console.thenile.dev</a>
          </div>

          <label>User email</label>
          <input
            name="email"
            value={form.email}
            onChange={(e) =>
              setForm((state) => ({
                ...state,
                email: e.target.value,
              }))
            }
          />
          <label>User password</label>
          <input
            name="password"
            type="password"
            value={form.password}
            onChange={(e) =>
              setForm((state) => ({
                ...state,
                password: e.target.value,
              }))
            }
          />
        </div>
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
