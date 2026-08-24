import { logEvent } from './logEvent.js';

const errorHandle = (err, req, res, next) => {
  logEvent(`${err.name}: ${err.message}`, 'errorHandle.txt');
  console.error(err);
  res.status(500).send(err.message);
};

export default errorHandle;