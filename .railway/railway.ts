import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "us-west2" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };

  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 5000,
  });
  const demoVolume = volume("demo-web-volume", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 5000,
  });

  const demoWeb = service("demo-web", {
    source: github("lionstashan/Silica-Sand-AFS-Test-Report", {
      branch: "transport-demo",
      checkSuites: false,
      rootDirectory: "/transport-management-system",
    }),
    build: {
      builder: "RAILPACK",
      buildCommand: "npm install",
      buildEnvironment: "V3",
    },
    startCommand: "npm start",
    replicas: { "us-west2": 1 },
    volumeMounts: { "/data": demoVolume },
    env: {
      APP_ENV: "demo",
      BCRYPT_COST: preserve(),
      CUSTOMER_TOKEN_SECRET: preserve(),
      CUSTOMER_TOKEN_TTL_SECONDS: preserve(),
      DATABASE_URL: preserve(),
      DEMO_PASSWORD: preserve(),
      DEMO_USERNAME: preserve(),
      DOC_UPLOAD_DIR: "/data",
      ENABLE_ADMIN_PANEL_V2: preserve(),
      ENABLE_EXPENSE_DIRECT_LOGIN: preserve(),
      ENABLE_LEGACY_PIN_AUTH: preserve(),
      ENABLE_USER_AUTH_V2: preserve(),
      EXPENSE_TOKEN_SECRET: preserve(),
      EXPENSE_TOKEN_TTL_SECONDS: preserve(),
      NODE_ENV: "production",
      TRANSPORT_TOKEN_SECRET: preserve(),
      TRANSPORT_TOKEN_TTL_SECONDS: preserve(),
    },
  });

  return project("transport-demo", {
    resources: [Postgres, demoWeb, postgresVolume, demoVolume],
  });
});
