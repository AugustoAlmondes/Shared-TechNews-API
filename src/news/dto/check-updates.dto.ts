/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsDateString,
    IsIn,
    IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CheckUpdatesDto {

    @IsOptional()

    @IsDateString()

    after?: string;

    @IsOptional()

    @Transform(({ value }) => {
        if (value === undefined || value === null) return undefined;
        if (Array.isArray(value)) {
            const flat = (value as unknown[]).flatMap((v) =>
                typeof v === 'string' ? v.split(',') : [],
            );
            const normalized = flat
                .map((v: string) => v.trim().toLowerCase())
                .filter((v: string) => v.length > 0);
            return [...new Set(normalized)];
        }
        if (typeof value !== 'string') return value;
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const parts = trimmed
            .split(',')
            .map((v: string) => v.trim().toLowerCase())
            .filter((v: string) => v.length > 0);
        return [...new Set(parts)];
    })

    @IsArray()

    @ArrayUnique()

    @ArrayMaxSize(3)

    @IsIn(['pt', 'en', 'es'], { each: true })

    languages?: string[];
}