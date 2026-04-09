import 'dotenv/config';

const parsedPort = Number(process.env.PORT);

export const env = {
  port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 8888,
  searchPrefix: 'Represent this sentence for searching relevant passages: ',
};
