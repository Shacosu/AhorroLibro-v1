import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { signToken, verifyToken } from '../config/jwt-config';

const prisma = new PrismaClient();

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching users' });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const user = await prisma.user.findUnique({ where: { id: Number(id) } });
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error fetching user' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  if (!req.body) {
    res.status(400).json({ error: 'Missing request body' });
    return;
  }
  const { email, password, name, lastname, phone, username } = req.body;
  const requiredFields = ['email', 'password', 'name', 'lastname', 'phone', 'username'];
  const missingFields = requiredFields.filter((field) => !req.body[field]);
  if (missingFields.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    return;
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        lastname,
        username,
        phone,
      },
    });
    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ error: 'Error creating user' });
  }
};

export const login = async (req: Request, res: Response) => {
  if (!req.body) {
    res.status(400).json({ error: 'Missing request body' });
    return;
  }
  const { email, password } = req.body;
  
  if (!email || !password) {
    res.status(400).json({ error: 'Email y contraseña son requeridos' });
    return;
  }
  
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Contraseña inválida' });
      return;
    }
    
    // Crear payload para el token
    const payload = { userId: user.id };
    
    // Firmar el token con el secreto
    const token = signToken(payload);
    
    // Eliminar la contraseña del objeto usuario
    const { password: _, ...userWithoutPassword } = user;
    
    // Establecer el token en una cookie segura
    res.cookie('auth_token', token, {
      httpOnly: true,          // No accesible desde JavaScript
      secure: process.env.NODE_ENV === 'production',            // Siempre usar secure cuando sameSite es 'none'
      sameSite: "none",        // Permitir cookies entre dominios diferentes
      maxAge: 24 * 60 * 60 * 1000, // 24 horas en milisegundos
      domain: process.env.NODE_ENV === 'production' ? '.ahorrolibro.cl' : 'localhost',
      path: '/',               // Asegurar que la cookie esté disponible en toda la aplicación
    });
    
    // Enviar respuesta con datos del usuario (sin el token en el cuerpo)
    res.json({ 
      success: true,
      message: 'Inicio de sesión exitoso',
      user: userWithoutPassword,
      token: token // Incluir el token en la respuesta para manejo manual en el cliente si es necesario
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

export const logout = async (req: Request, res: Response) => {
  // Eliminar la cookie de autenticación
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Always use secure for sameSite: 'none'
    sameSite: "none",
    domain: process.env.NODE_ENV === 'production' ? '.ahorrolibro.cl' : 'localhost',
    path: '/',
  });
  
  // Enviar respuesta de éxito
  res.json({ 
    success: true, 
    message: 'Sesión cerrada correctamente' 
  });
};

// Función para obtener el usuario actual basado en el token
export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // El middleware auth ya ha verificado el token y añadido el userId a req
    const userId = (req as any).user?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    
    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      omit: {
        password: true
      }
    });
    
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Error al obtener usuario actual:', error);
    res.status(500).json({ error: 'Error al obtener información del usuario' });
  }
};

// Función para refrescar el token de autenticación
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // Obtener el token de la cookie
    const token = req.cookies.auth_token;
    
    // Log para depuración
    console.log('Refresh token request received. Cookie present:', !!token);
    
    if (!token) {
      // Intentar obtener el token del encabezado de autorización como alternativa
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const headerToken = authHeader.substring(7);
        console.log('Using Authorization header token instead of cookie');
        
        try {
          const decoded = verifyToken(headerToken);
          const userId = decoded.userId;
          
          // Buscar el usuario
          const user = await prisma.user.findUnique({ 
            where: { id: userId },
            omit: {
              password: true
            }
          });
          
          if (!user) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
          }
          
          // Generar un nuevo token
          const newToken = signToken({ userId });
          
          // Establecer el nuevo token en una cookie
          res.cookie('auth_token', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Always use secure for sameSite: 'none'
            sameSite: "none",
            maxAge: 24 * 60 * 60 * 1000, // 24 horas
            domain: process.env.NODE_ENV === 'production' ? '.ahorrolibro.cl' : 'localhost',
            path: '/',
          });
          
          // Enviar respuesta con datos del usuario
          res.json({ 
            success: true,
            message: 'Token refrescado correctamente desde header',
            user,
            token: newToken
          });
          return;
        } catch (error) {
          console.error('Error al verificar token del header:', error);
          // Continuar con el flujo normal si el token del header también falla
        }
      }
      
      res.status(401).json({ 
        error: 'No hay token para refrescar',
        cookiesPresent: Object.keys(req.cookies).length > 0,
        allCookies: Object.keys(req.cookies)
      });
      return;
    }
    
    // Verificar el token actual
    try {
      const decoded = verifyToken(token);
      const userId = decoded.userId;
      
      console.log('Token verified successfully for user ID:', userId);
      
      // Buscar el usuario para asegurarnos de que existe
      const user = await prisma.user.findUnique({ 
        where: { id: userId },
        omit: {
          password: true
        }
      });
      
      if (!user) {
        console.log('User not found for ID:', userId);
        res.status(404).json({ error: 'Usuario no encontrado' });
        return;
      }
      
      // Generar un nuevo token
      const newToken = signToken({ userId });
      
      // Establecer el nuevo token en una cookie
      res.cookie('auth_token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Always use secure for sameSite: 'none'
        sameSite: "none",
        maxAge: 24 * 60 * 60 * 1000,
        domain: process.env.NODE_ENV === 'production' ? '.ahorrolibro.cl' : 'localhost',
        path: '/',
      });
      
      console.log('New token generated and cookie set');
      
      // Enviar respuesta con datos del usuario
      res.json({ 
        success: true,
        message: 'Token refrescado correctamente',
        user,
        token: newToken // Incluir el token en la respuesta para manejo manual en el cliente si es necesario
      });
    } catch (error) {
      // Si hay un error al verificar el token (expirado o inválido)
      console.error('Error al verificar token:', error);
      res.status(401).json({ 
        error: 'Token inválido o expirado',
        message: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  } catch (error) {
    console.error('Error al refrescar token:', error);
    res.status(500).json({ 
      error: 'Error al refrescar el token',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};