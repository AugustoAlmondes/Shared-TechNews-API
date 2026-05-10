import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Cache } from '@nestjs/cache-manager';
import { firstValueFrom } from "rxjs"

export interface ResponseNews {
    status: string;
    news: TypeNews[];
    page: number;
}

export interface TypeNews {
    id: string;
    title: string;
    description: string;
    url: string;
    author: string;
    image: string;
    language: string;
    category: string[];
    source_category: unknown[];
    published: string;
}

@Injectable()
export class NewsService {
    private readonly BASE_URL = 'https://api.currentsapi.services/v1/latest-news'
    constructor(
        private readonly httpService: HttpService,
        private readonly ConfigService: ConfigService,

        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache
    ) { }

    async getLatestNews(page: number = 1): Promise<ResponseNews> {
        const cacheKey = `latest-news-page-${page}`

        const cachedData = await this.cacheManager.get(cacheKey)

        if (cachedData) return cachedData as ResponseNews;

        try {


            const apiKey = this.ConfigService.get<string>('CURRENTS_API_KEY')

            const response = await firstValueFrom(
                this.httpService.get(this.BASE_URL, {
                    params: {
                        apiKey,
                        page_number: page
                    }
                })
            );

            if (response.data) {

                await this.cacheManager.set(
                    cacheKey,
                    response.data
                );

                return response.data as ResponseNews;
            };

            throw new InternalServerErrorException(
                'Dados de resposta inválidos da API externa'
            );
        } catch {
            throw new InternalServerErrorException(
                'Erro ao buscar notícias'
            )
        }
    };


    async checkUpdates(after: string)
        : Promise<{ hasNew: boolean, count: number }> {
        const latestNews =
            await this.getLatestNews(1);

        const newsList =
            latestNews.news || [];

        const afterDate =
            new Date(after);

        const newNews = newsList.filter(
            (news: TypeNews) => {
                return new Date(news.published) > afterDate
            }
        );

        return {
            hasNew: newNews.length > 0,
            count: newNews.length
        }
    };
}
