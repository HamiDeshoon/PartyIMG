module.exports = {
  apps: [
    {
      name: "partyimg-server",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};