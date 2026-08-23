import {
    IsDateString,
    IsOptional,
} from 'class-validator';

export class CheckUpdatesDto {

    @IsOptional()

    @IsDateString()

    after?: string;
}