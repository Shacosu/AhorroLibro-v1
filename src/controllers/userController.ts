import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

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