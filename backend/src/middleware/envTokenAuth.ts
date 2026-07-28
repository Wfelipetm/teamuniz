import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";

type TokenPayload = {
  token: string | undefined;
};

const envTokenAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { token: bodyToken } = req.body as TokenPayload;
    const { token: queryToken } = req.query as TokenPayload;
    const envToken = process.env.ENV_TOKEN;

    if (!envToken) {
      throw new AppError("ENV_TOKEN não configurado", 403);
    }

    if (queryToken === envToken) {
      return next();
    }

    if (bodyToken === envToken) {
      return next();
    }
  } catch (e) {
    console.log(e);
  }

  throw new AppError("Token inválido", 403);
};

export default envTokenAuth;
