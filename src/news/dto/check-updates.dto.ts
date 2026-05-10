import {
    IsDateString,
} from 'class-validator';

export class CheckUpdatesDto {

    @IsDateString()

    after?: string;
}