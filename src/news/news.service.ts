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
    private readonly CACHE_TTL_MS = 1000 * 60 * 15; // 15min — mantido para consulta normal

    constructor(
        private readonly httpService: HttpService,
        private readonly ConfigService: ConfigService,

        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache
    ) { }

    private getCacheKey(page: number): string {
        return `latest-news-bilingual-page-${page}`;
    }

    private getRefreshKey(page: number): string {
        return `${this.getCacheKey(page)}:lastRefresh`;
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

    async getLatestNews(page: number = 1, forceRefresh: boolean = false): Promise<ResponseNews> {
        const cacheKey = this.getCacheKey(page);
        const refreshKey = this.getRefreshKey(page);

        const cachedData = await this.cacheManager.get<ResponseNews>(cacheKey);

        // Consulta normal: retorna cache se válido
        if (!forceRefresh && cachedData) {
            return { ...cachedData, cached: true } as ResponseNews;
        }

        // Atualização forçada: verifica cooldown
        if (forceRefresh) {
            const lastRefresh = await this.cacheManager.get<number>(refreshKey);
            const now = Date.now();
            if (lastRefresh && now - lastRefresh < this.REFRESH_COOLDOWN_MS && cachedData) {
                // Dentro do intervalo de proteção — retorna cache existente
                return { ...cachedData, cached: true } as ResponseNews;
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

            const languages = ['en', 'pt', 'es'];

            const promises = languages.map((language) =>
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
                    const data = result.value.data as ResponseNews;
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
                    return { ...cachedData, cached: true } as ResponseNews;
                }
                throw new InternalServerErrorException('Erro ao buscar notícias');
            }

            // Merge das línguas bem-sucedidas
            const allNews: TypeNews[] = [];
            let status = 'ok';
            for (const data of successful) {
                if (data.status) status = data.status;
                const list: TypeNews[] = (data.news ?? []) as TypeNews[];
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
                return { ...cachedData, cached: true } as ResponseNews;
            }
            // Evita vazar detalhes internos
            if (error instanceof InternalServerErrorException) throw error;
            throw new InternalServerErrorException(
                'Erro ao buscar notícias'
            )
        }
    };


    async checkUpdates(after: string)
        : Promise<{ hasNew: boolean, count: number }> {
        // Se after vazio ou inválido, considera que não há referência — retorna sem novos
        if (!after || typeof after !== 'string' || !after.trim()) {
            return { hasNew: false, count: 0 };
        }

        const afterDate = new Date(after);
        if (isNaN(afterDate.getTime())) {
            return { hasNew: false, count: 0 };
        }

        // Reutiliza cache de page 1 — respeita TTL e cooldown já implementados em getLatestNews
        // Não força refresh aqui para evitar spam; frontend deve usar ?refresh=true em /news quando quiser forçar
        const latestNews =
            await this.getLatestNews(1);

        const newsList =
            latestNews.news || [];

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
