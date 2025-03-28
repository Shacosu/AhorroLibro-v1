import jwt from 'jsonwebtoken';

// Secreto para firmar los tokens
const JWT_SECRET = process.env.JWT_SECRET || 'kCLy5pCSOa+VjnmCO5UQWpWgJpP0elgwNxqlkAnCwqcVRuAGNCcFizHhffg=';

// Función para firmar un token JWT evitando problemas de tipos
export function signToken(payload: any, expiresIn: string = '24h'): string {
  // Usando el método sign de jwt pero con una implementación que evita errores de tipos
  return jwt.sign(
    payload, 
    JWT_SECRET, 
    { expiresIn } as jwt.SignOptions
  );
}

// Función para verificar un token JWT evitando problemas de tipos
export function verifyToken(token: string): any {
  // Usando el método verify de jwt pero con una implementación que evita errores de tipos
  return jwt.verify(token, JWT_SECRET);
}
