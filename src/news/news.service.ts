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
    hasMore?: boolean;
    count?: number;
    cached?: boolean;
}

export interface TypeNews {
    id: string;
    title: string;
    description: string;
    url: string;
    author: string;
    image: string | null;
    language: string;
    category: string[];
    source_category: unknown[];
    published: string;
}

@Injectable()
export class NewsService {
    private readonly BASE_URL = 'https://api.currentsapi.services/v2/latest-news'
    private readonly REFRESH_COOLDOWN_MS = 60 * 1000; // 60s — protege contra spam de refresh e respeita limites da Currents API
    private readonly CACHE_TTL_MS = 1000 * 60 * 15; // 15min — para GET /news
    private readonly CHECK_UPDATES_CACHE_TTL_MS = 1000 * 60 * 5; // 5min — para GET /news/check-updates

    constructor(
        private readonly httpService: HttpService,
        private readonly ConfigService: ConfigService,

        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache
    ) { }

    private readonly DEFAULT_LANGUAGES: string[] = ['en', 'pt', 'es'];

    private normalizeLanguages(languages?: string[]): string[] {
        if (!languages || languages.length === 0) {
            return [...this.DEFAULT_LANGUAGES].sort();
        }
        const normalized = languages
            .map((l) => l.trim().toLowerCase())
            .filter((l) => l.length > 0);
        const unique = [...new Set(normalized)];
        return unique.sort();
    }

    private getCacheKey(page: number, languages: string[]): string {
        const langsKey = languages.join('-');
        return `latest-news:page:${page}:langs:${langsKey}`;
    }

    private getRefreshKey(page: number, languages: string[]): string {
        return `${this.getCacheKey(page, languages)}:lastRefresh`;
    }

    private getCheckUpdatesCacheKey(page: number, languages: string[]): string {
        const langsKey = languages.join('-');
        return `check-updates:page:${page}:langs:${langsKey}`;
    }

    private normalizeImage(image: unknown): string | null {
        if (typeof image !== 'string') return null;
        const trimmed = image.trim();
        if (!trimmed) return null;
        if (trimmed.toLowerCase() === 'none') return null;
        if (trimmed.toLowerCase() === 'null') return null;
        if (trimmed.toLowerCase() === 'undefined') return null;
        // Validação básica de URL — evita strings arbitrárias
        if (!/^https?:\/\//i.test(trimmed)) return null;
        try {
            // Tenta parsear como URL para validar formato
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const u = new URL(trimmed);
            return trimmed;
        } catch {
            return null;
        }
    }

    private normalizeNews(news: TypeNews): TypeNews {
        return {
            ...news,
            image: this.normalizeImage(news.image),
        };
    }

    private parsePublished(published: string): number {
        const ts = new Date(published).getTime();
        return isNaN(ts) ? 0 : ts;
    }

    private sortByPublishedDesc(news: TypeNews[]): TypeNews[] {
        return [...news].sort((a, b) => {
            const ta = this.parsePublished(a.published);
            const tb = this.parsePublished(b.published);
            // Notícias sem data ou inválida vão para o final (0)
            if (ta === 0 && tb === 0) return 0;
            if (ta === 0) return 1;
            if (tb === 0) return -1;
            return tb - ta; // mais recentes primeiro
        });
    }

    private deduplicate(news: TypeNews[]): TypeNews[] {
        const seen = new Set<string>();
        const result: TypeNews[] = [];
        for (const item of news) {
            const key = item.url || item.id;
            if (!key) {
                result.push(item);
                continue;
            }
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(item);
        }
        return result;
    }

    async getLatestNews(
        page: number = 1,
        forceRefresh: boolean = false,
        languages?: string[],
    ): Promise<ResponseNews> {
        const normalizedLanguages = this.normalizeLanguages(languages);
        const cacheKey = this.getCacheKey(page, normalizedLanguages);
        const refreshKey = this.getRefreshKey(page, normalizedLanguages);

        const cachedData = await this.cacheManager.get<ResponseNews>(cacheKey);

        // Consulta normal: retorna cache se válido
        if (!forceRefresh && cachedData) {
            return { ...cachedData, cached: true };
        }

        // Atualização forçada: verifica cooldown
        if (forceRefresh) {
            const lastRefresh = await this.cacheManager.get<number>(refreshKey);
            const now = Date.now();
            if (lastRefresh && now - lastRefresh < this.REFRESH_COOLDOWN_MS && cachedData) {
                // Dentro do intervalo de proteção — retorna cache existente
                return { ...cachedData, cached: true };
            }
        }

        // Se não há cache e for refresh bloqueado, cairá aqui e fará fetch.
        // Se forceRefresh=false e não há cache, também faz fetch.

        try {
            const apiKey = this.ConfigService.get<string>('CURRENTS_API_KEY')

            const commonParams = {
                apiKey,
                page_number: page,
                category: 'science_technology',
            };

            const promises = normalizedLanguages.map((language) =>
                firstValueFrom(
                    this.httpService.get<ResponseNews>(this.BASE_URL, {
                        params: { ...commonParams, language },
                    })
                )
            );

            const settled = await Promise.allSettled(promises);

            const successful: ResponseNews[] = [];
            for (const result of settled) {
                if (result.status === 'fulfilled' && result.value?.data) {
                    const data = result.value.data;
                    // Só considera se tiver estrutura esperada
                    if (Array.isArray(data.news)) {
                        successful.push(data);
                    } else if (data) {
                        // Caso venha sem news mas com dados, tenta usar
                        successful.push(data);
                    }
                }
            }

            if (successful.length === 0) {
                // Todas falharam — tenta fallback para cache stale se existir
                if (cachedData) {
                    return { ...cachedData, cached: true };
                }
                throw new InternalServerErrorException('Erro ao buscar notícias');
            }

            // Merge das línguas bem-sucedidas
            const allNews: TypeNews[] = [];
            let status = 'ok';
            for (const data of successful) {
                if (data.status) status = data.status;
                const list: TypeNews[] = (data.news ?? []);
                for (const n of list) {
                    allNews.push(this.normalizeNews(n));
                }
            }

            // Deduplicação por url/id e ordenação determinística por published
            const deduped = this.deduplicate(allNews);
            const sorted = this.sortByPublishedDesc(deduped);

            const hasMore = sorted.length > 0;
            // Currents API não fornece total confiável; hasMore indica se há dados
            // Se a API retornar array vazio, sabemos que não há mais páginas

            const mergedResponse: ResponseNews = {
                status,
                news: sorted,
                page,
                hasMore,
                count: sorted.length,
                cached: false,
            };

            await this.cacheManager.set(cacheKey, mergedResponse, this.CACHE_TTL_MS);
            await this.cacheManager.set(refreshKey, Date.now(), this.CACHE_TTL_MS);

            return mergedResponse;
        } catch (error) {
            // Se já temos cache, retorna stale em vez de 500 para resiliência
            if (cachedData) {
                return { ...cachedData, cached: true };
            }
            // Evita vazar detalhes internos
            if (error instanceof InternalServerErrorException) throw error;
            throw new InternalServerErrorException(
                'Erro ao buscar notícias'
            )
        }
    };


    async checkUpdates(after: string, languages?: string[])
        : Promise<{ hasNew: boolean, count: number }> {
        // Se after vazio ou inválido, considera que não há referência — retorna sem novos
        if (!after || typeof after !== 'string' || !after.trim()) {
            return { hasNew: false, count: 0 };
        }

        const afterDate = new Date(after);
        if (isNaN(afterDate.getTime())) {
            return { hasNew: false, count: 0 };
        }

        const normalizedLanguages = this.normalizeLanguages(languages);
        const cacheKey = this.getCheckUpdatesCacheKey(1, normalizedLanguages);

        let cachedData = await this.cacheManager.get<ResponseNews>(cacheKey);
        let newsList: TypeNews[] = [];

        if (cachedData) {
            newsList = cachedData.news || [];
        } else {
            try {
                const apiKey = this.ConfigService.get<string>('CURRENTS_API_KEY');
                const commonParams = {
                    apiKey,
                    page_number: 1,
                    category: 'science_technology',
                };
                const promises = normalizedLanguages.map((language) =>
                    firstValueFrom(
                        this.httpService.get<ResponseNews>(this.BASE_URL, {
                            params: { ...commonParams, language },
                        }),
                    ),
                );
                const settled = await Promise.allSettled(promises);
                const successful: ResponseNews[] = [];
                for (const result of settled) {
                    if (result.status === 'fulfilled' && result.value?.data) {
                        const data = result.value.data as ResponseNews;
                        if (Array.isArray(data.news)) {
                            successful.push(data);
                        } else if (data) {
                            successful.push(data);
                        }
                    }
                }
                if (successful.length === 0) {
                    return { hasNew: false, count: 0 };
                } else {
                    const allNews: TypeNews[] = [];
                    let status = 'ok';
                    for (const data of successful) {
                        if (data.status) status = data.status;
                        const list: TypeNews[] = (data.news ?? []) as TypeNews[];
                        for (const n of list) {
                            allNews.push(this.normalizeNews(n));
                        }
                    }
                    const deduped = this.deduplicate(allNews);
                    const sorted = this.sortByPublishedDesc(deduped);
                    const mergedResponse: ResponseNews = {
                        status,
                        news: sorted,
                        page: 1,
                        hasMore: sorted.length > 0,
                        count: sorted.length,
                        cached: false,
                    };
                    await this.cacheManager.set(cacheKey, mergedResponse, this.CHECK_UPDATES_CACHE_TTL_MS);
                    newsList = sorted;
                }
            } catch {
                return { hasNew: false, count: 0 };
            }
        }

        const newNews = newsList.filter(
            (news: TypeNews) => {
                const publishedTime = this.parsePublished(news.published);
                if (publishedTime === 0) return false; // ignora datas inválidas
                return publishedTime > afterDate.getTime();
            }
        );

        return {
            hasNew: newNews.length > 0,
            count: newNews.length
        }
    };
}
