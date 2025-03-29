import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt-config';

interface AuthRequest extends Request {
  user?: {
    userId: number;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Log all possible token locations for debugging
  
  // Try to get token from multiple sources
  // 1. From cookie (primary method)
  let token = req.cookies?.auth_token;
  
  // 2. From Authorization header (Bearer token)
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  
  // 3. From query parameter (less secure, but useful for debugging)
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

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
