import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

export interface UserPayload {
    id: string;
    name: string;
    email: string;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) { }

    async registerUser(createUserDto: CreateUserDto) {
        const { password, ...userData } = createUserDto;

        const userExists = await this.prisma.user.findUnique({
            where: { email: userData.email },
        });

        if (userExists) {
            throw new RpcException({
                status: HttpStatus.BAD_REQUEST,
                message: 'El email ya está registrado',
            });
        }

        try {
            const user = await this.prisma.user.create({
                data: {
                    ...userData,
                    password: bcrypt.hashSync(password, 10),
                },
            });

            const { password: __, ...rest } = user;

            return {
                user: rest,
                token: this.signToken(rest),
            };
        } catch {
            throw new RpcException({
                status: HttpStatus.BAD_REQUEST,
                message: 'No se pudo crear el usuario',
            });
        }
    }

    async loginUser(loginUserDto: LoginUserDto) {
        const { email, password } = loginUserDto;

        const user = await this.prisma.user.findUnique({ where: { email } });

        if (!user || !bcrypt.compareSync(password, user.password)) {
            throw new RpcException({
                status: HttpStatus.UNAUTHORIZED,
                message: 'Credenciales inválidas',
            });
        }

        const { password: __, ...rest } = user;

        return {
            user: rest,
            token: this.signToken(rest),
        };
    }

    async verifyToken(token: string) {
        try {
            const payload = this.jwtService.verify(token) as UserPayload & {
                iat?: number;
                exp?: number;
            };

            const user: UserPayload = {
                id: payload.id,
                name: payload.name,
                email: payload.email,
            };

            return {
                user,
                token: this.signToken(user),
            };
        } catch {
            throw new RpcException({
                status: HttpStatus.UNAUTHORIZED,
                message: 'Token inválido',
            });
        }
    }

    private signToken(payload: UserPayload) {
        const { id, name, email } = payload;
        return this.jwtService.sign({ id, name, email });
    }
}
