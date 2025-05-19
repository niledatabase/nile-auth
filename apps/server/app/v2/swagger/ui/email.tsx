import { HEADER_ORIGIN } from "@nile-auth/core/cookies/constants";

export default function Email({ form, setForm }: { form: any; setForm: any }) {
  if (form.provider !== "email") {
    return (
      <div>
        <button
          onClick={(e) => {
            e.preventDefault();
            setForm((f: any) => {
              return { ...f, provider: "email" };
            });
          }}
        >
          show email
        </button>
      </div>
    );
  }
  return (
    <div className="form-wrapper">
      <div className="flex flex-col gap-1">
        <div>
          <button
            onClick={(e) => {
              e.preventDefault();
              setForm((f: any) => {
                return { ...f, provider: "" };
              });
            }}
          >
            hide email
          </button>
        </div>
        Login using the specified email, configured via the email provider on
        your database at console.thenile.dev
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
        <div>
          <button
            style={{ marginTop: "1rem" }}
            onClick={async (e) => {
              e.stopPropagation();
              e.preventDefault();
              const csrf = await fetch(
                `/v2/databases/${form.database}/auth/csrf`,
              );
              const { csrfToken } = await csrf.json();
              // doing this manually, @niledatabase/react handles this automatically
              await fetch(`/v2/databases/${form.database}/auth/signin/email`, {
                method: "POST",
                body: new URLSearchParams({ email: form.email, csrfToken }),
                headers: {
                  [HEADER_ORIGIN]: window.location.origin,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
              });
              window.location.search = new URLSearchParams(form).toString();
            }}
          >
            Send email or sign in
          </button>
        </div>
      </div>
    </div>
  );
}
