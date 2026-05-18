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
    private readonly BASE_URL = 'https://api.currentsapi.services/v2/latest-news'
    constructor(
        private readonly httpService: HttpService,
        private readonly ConfigService: ConfigService,

        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache
    ) { }

    async getLatestNews(page: number = 1): Promise<ResponseNews> {
        const cacheKey = `latest-news-bilingual-page-${page}`

        const cachedData = await this.cacheManager.get(cacheKey)

        if (cachedData) return cachedData as ResponseNews;

        try {
            const apiKey = this.ConfigService.get<string>('CURRENTS_API_KEY')

            const commonParams = {
                apiKey,
                page_number: page,
                category: 'science_technology',
            };

            const [responseEn, responsePt, responseEs] = await Promise.all([
                firstValueFrom(
                    this.httpService.get<ResponseNews>(this.BASE_URL, {
                        params: { ...commonParams, language: 'en' },
                    })
                ),
                firstValueFrom(
                    this.httpService.get<ResponseNews>(this.BASE_URL, {
                        params: { ...commonParams, language: 'pt' },
                    })
                ),
                firstValueFrom(
                    this.httpService.get<ResponseNews>(this.BASE_URL, {
                        params: { ...commonParams, language: 'es' },
                    })
                ),
            ]);

            if (responseEn.data && responsePt.data && responseEs.data) {

                const newsEn: TypeNews[] = responseEn.data.news ?? [];
                const newsPt: TypeNews[] = responsePt.data.news ?? [];
                const newsEs: TypeNews[] = responseEs.data.news ?? [];

                const mergedNews: TypeNews[] = [...newsEn, ...newsPt, ...newsEs];

                // Fisher-Yates shuffle — embaralha de forma imparcial e uniforme
                for (let i = mergedNews.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [mergedNews[i], mergedNews[j]] = [mergedNews[j], mergedNews[i]];
                }

                const mergedResponse: ResponseNews = {
                    status: responseEn.data?.status ?? 'ok',
                    news: mergedNews,
                    page,
                };

                await this.cacheManager.set(cacheKey, mergedResponse);

                return mergedResponse;
            }
            else if (responseEn) {
                return responseEn.data;
            }
            else if (responsePt) {
                return responsePt.data;
            }
            else if (responseEs) {
                return responseEs.data;
            }
            return {} as ResponseNews;
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
