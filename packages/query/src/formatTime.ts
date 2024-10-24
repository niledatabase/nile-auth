export function formatTime() {
  const [, nanoseconds] = process.hrtime();
  const now = new Date();

  // Get the current date parts
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const secondsStr = String(now.getSeconds()).padStart(2, "0");

  // Calculate the current milliseconds and microseconds
  const milliseconds = String(now.getMilliseconds()).padStart(3, "0");
  const microseconds = String(Math.floor(nanoseconds / 1000) % 1000).padStart(
    3,
    "0",
  );

  // Combine to get the formatted string - its what java did, so we do it too, I guess
  const formattedTime = `${year}-${month}-${day} ${hours}:${minutes}:${secondsStr}.${milliseconds}${microseconds}`;

  return formattedTime;
}
