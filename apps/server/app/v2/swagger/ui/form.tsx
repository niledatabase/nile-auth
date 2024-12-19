"use client";

import { useEffect, useState } from "react";
import Credentials from "./credentials";
import Email from "./email";

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
  const [form, setForm] = useState(filler({}));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const obj = Object.fromEntries(params.entries());
    setForm(filler(obj));
  }, []);

  return (
    <div>
      <button
        onClick={(e) => {
          e.preventDefault();
          setVisible(!visible);
        }}
      >
        {visible ? "hide" : "show"} override vars
      </button>

      <div className="form-content">
        <div
          className="form-wrapper"
          style={{ display: visible ? "flex" : "none" }}
        >
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
            name="nothing"
          />
          <label>NileDB password</label>
          <input
            value={form.developerPassword}
            onChange={(e) =>
              setForm((state) => ({
                ...state,
                developerPassword: e.target.value,
              }))
            }
            type="password"
            autoComplete="new-password"
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
        <Credentials form={form} setForm={setForm} />
        <Email form={form} setForm={setForm} />
      </div>
    </div>
  );
}
