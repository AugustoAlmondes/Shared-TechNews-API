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

    async getLatestNews(page: number = 1) {
        const cacheKey = `latest-news-page-${page}`

        const cachedData = await this.cacheManager.get(cacheKey)

        if (cachedData) return cachedData

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

            if(response.data){

                await this.cacheManager.set(
                    cacheKey,
                    response.data
                );

                return response.data as ResponseNews;
            };

            throw new InternalServerErrorException(
                'Dados de resposta inválidos da API externa'
            );
        } catch (error) {
            throw new InternalServerErrorException(
                'Erro ao buscar notícias'
            )
        }
    }
}
