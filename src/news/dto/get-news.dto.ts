import {
    IsBoolean,
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
}