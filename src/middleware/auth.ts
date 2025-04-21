import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt-config';

interface AuthRequest extends Request {
  user?: {
    userId: number;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.auth_token;
  
  if (!token) {
    res.status(401).json({ error: 'Acceso denegado. No has iniciado sesión.' });
    return;
  }

  try {
    const decoded = verifyToken(token) as { userId: number };
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(403).json({ error: 'Sesión inválida o expirada. Por favor, inicia sesión nuevamente.' });
    return;
  }
};
