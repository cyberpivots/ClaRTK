import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => {
  return {
    service: "api",
    status: "ok",
    workspace: "clartk"
  };
});

const port = Number(process.env.PORT ?? "3000");

if (process.env.CLARTK_API_AUTOSTART === "1") {
  app.listen({ host: "0.0.0.0", port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}

export { app };

