/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsIn,
    IsNumber,
    IsOptional,
    Min
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class GetNewsDto {
    @IsOptional() // O parâmetro não é obrigatório

    @Type(() => Number) // Transforma o valor para número (Ex. '1' => 1)

    @IsNumber() // Garante que é número

    @Min(1) // Imprede 0 e negativos

    page?: number = 1; // Valor padrão

    @IsOptional()

     
    @Transform(({ value }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    })

    @IsBoolean()

    refresh?: boolean = false;

    @IsOptional()

     
    @Transform(({ value }) => {
        if (value === undefined || value === null) return undefined;
        if (Array.isArray(value)) {
            // Caso venha como array (ex: ?languages=pt&languages=en), achata e normaliza
            const flat = (value as unknown[]).flatMap((v) =>
                typeof v === 'string' ? v.split(',') : [],
            );
            const normalized = flat
                .map((v: string) => v.trim().toLowerCase())
                .filter((v: string) => v.length > 0);
            // Remove duplicidades preservando ordem antes da validacao (service ordena)
            return [...new Set(normalized)];
        }
        if (typeof value !== 'string') return value;
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const parts = trimmed
            .split(',')
            .map((v: string) => v.trim().toLowerCase())
            .filter((v: string) => v.length > 0);
        // Remove duplicidades
        return [...new Set(parts)];
    })

    @IsArray()

    @ArrayUnique()

    @ArrayMaxSize(3)

    @IsIn(['pt', 'en', 'es'], { each: true })

    languages?: string[];
}