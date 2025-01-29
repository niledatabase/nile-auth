import { generateEmailBody } from "./email";

describe("email provider", () => {
  it("uses defaults", () => {
    const payload = {
      email: "email@email.com",
      template: {
        subject: "Reset password",
        body: "${user.email}${api_url}",
        sender: "",
      },
      variables: [],
      url: "http://localhost:3000",
    };

    expect(generateEmailBody(payload)).toEqual({
      subject: "Reset password",
      body: "email@email.comhttp://localhost:3000/",
      from: "noreply@thenile.dev",
    });
  });

  it("replaces email vars", () => {
    const payload = {
      email: "email@email.com",
      template: {
        subject: "Reset password",
        body: "${user.email}${api_url}",
        sender: "",
      },
      variables: [
        { name: "user.email", value: "no@no.com" },
        { name: "sender", value: "yeet@yeet.com" },
      ],
      url: "http://localhost:3000",
    };

    expect(generateEmailBody(payload)).toEqual({
      subject: "Reset password",
      body: "no@no.comhttp://localhost:3000/",
      from: "yeet@yeet.com",
    });
  });
});
