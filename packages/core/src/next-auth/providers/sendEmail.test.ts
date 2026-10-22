import { createServer, Socket } from "node:net";
import { AddressInfo } from "node:net";

import { sendEmail } from "./email";

describe("SMTP delivery", () => {
  it("sends a message using the configured SMTP URL", async () => {
    const commands: string[] = [];
    const sockets = new Set<Socket>();
    let message = "";
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.write("220 localhost ESMTP\r\n");
      let input = "";
      let inMessage = false;
      socket.on("data", (data) => {
        input += data.toString();
        let end: number;
        while ((end = input.indexOf("\r\n")) !== -1) {
          const line = input.slice(0, end);
          input = input.slice(end + 2);
          if (inMessage) {
            if (line === ".") {
              inMessage = false;
              socket.write("250 queued\r\n");
            } else {
              message += line + "\r\n";
            }
            continue;
          }
          commands.push(line);
          if (line.startsWith("EHLO")) {
            socket.write("250-localhost\r\n250 PIPELINING\r\n");
          } else if (line === "DATA") {
            inMessage = true;
            socket.write("354 send message\r\n");
          } else if (line === "QUIT") {
            socket.end("221 bye\r\n");
          } else {
            socket.write("250 OK\r\n");
          }
        }
      });
    });

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    try {
      await sendEmail({
        url: `smtp://127.0.0.1:${port}`,
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Verify your email",
        body: "<p>Verification code: 123456</p>",
      });

      expect(commands).toContain("MAIL FROM:<noreply@example.com>");
      expect(commands).toContain("RCPT TO:<user@example.com>");
      expect(message).toContain("Subject: Verify your email");
      expect(message).toContain("Verification code: 123456");
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
