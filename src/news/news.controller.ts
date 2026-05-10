import { Controller, Get, Query } from '@nestjs/common';

import { NewsService } from './news.service';

import { GetNewsDto } from './dto/get-news.dto';

import { CheckUpdatesDto } from './dto/check-updates.dto';

@Controller('news')
export class NewsController {
    constructor(
        private readonly newsService: NewsService,
    ) { }

    @Get()
    async getNews(
        @Query() query: GetNewsDto,
    ) {
        return this.newsService.getLatestNews(
            query.page
        )
    };

    @Get('check-updates')
    async CheckUpdates(
        @Query() query: CheckUpdatesDto,
    ) {
        return this.newsService.checkUpdates(
            query.after || ""
        )
    };
}
