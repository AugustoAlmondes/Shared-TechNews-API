import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NewsService, TypeNews, ResponseNews } from './news.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';

// Helper para criar notícia
function makeNews(overrides: Partial<TypeNews> & { id: string }): TypeNews {
  return {
    title: 'title',
    description: 'desc',
    url: `https://example.com/${overrides.id}`,
    author: 'author',
    image: 'https://example.com/img.jpg',
    language: 'en',
    category: ['science_technology'],
    source_category: [],
    published: new Date().toISOString(),
    ...overrides,
  };
}

describe('NewsService', () => {
  let service: NewsService;
  let cache: { get: jest.Mock; set: jest.Mock };
  let http: { get: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    cache = { get: jest.fn(), set: jest.fn().mockResolvedValue(undefined) };
    http = { get: jest.fn() };
    config = { get: jest.fn().mockReturnValue('fake-key') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsService,
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: HttpService, useValue: http },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<NewsService>(NewsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('Cache', () => {
    it('consulta normal utiliza cache — cache válido é reutilizado', async () => {
      const cached: ResponseNews = {
        status: 'ok',
        page: 1,
        news: [makeNews({ id: '1', published: new Date().toISOString() })],
        hasMore: true,
        count: 1,
        cached: true,
      };
      cache.get.mockResolvedValueOnce(cached); // primeiro get para cacheKey

      const result = await service.getLatestNews(1, false);
      expect(result.cached).toBe(true);
      expect(result.news[0].id).toBe('1');
      expect(http.get).not.toHaveBeenCalled();
      expect(cache.get).toHaveBeenCalledWith('latest-news-bilingual-page-1');
    });

    it('cache miss busca na API externa', async () => {
      cache.get.mockResolvedValue(null); // cache miss
      cache.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null); // cacheKey + refreshKey
      // mas getLatestNews chama cache.get duas vezes apenas se forceRefresh; para miss normal só uma
      cache.get.mockReset();
      cache.get.mockImplementation((key: string) => {
        if (key.includes('lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });

      const enNews = [makeNews({ id: 'en1', published: '2026-01-01T10:00:00Z', language: 'en' })];
      const ptNews = [makeNews({ id: 'pt1', published: '2026-01-01T11:00:00Z', language: 'pt' })];
      const esNews = [makeNews({ id: 'es1', published: '2026-01-01T09:00:00Z', language: 'es' })];

      http.get.mockImplementation((_url: string, opts: any) => {
        const lang = opts.params.language;
        if (lang === 'en') return of({ data: { status: 'ok', news: enNews, page: 1 } });
        if (lang === 'pt') return of({ data: { status: 'ok', news: ptNews, page: 1 } });
        if (lang === 'es') return of({ data: { status: 'ok', news: esNews, page: 1 } });
        return of({ data: { status: 'ok', news: [], page: 1 } });
      });

      const result = await service.getLatestNews(1, false);
      expect(http.get).toHaveBeenCalledTimes(3);
      expect(cache.set).toHaveBeenCalled();
      expect(result.cached).toBe(false);
      expect(result.count).toBe(3);
    });

    it('atualização forçada pode obter dados novos e atualiza cache', async () => {
      const oldCached: ResponseNews = {
        status: 'ok',
        page: 1,
        news: [makeNews({ id: 'old', published: '2026-01-01T00:00:00Z' })],
        hasMore: true,
        count: 1,
        cached: true,
      };
      // Para forceRefresh, primeiro get retorna cache, segundo get para refreshKey retorna null (fora cooldown)
      cache.get.mockImplementation((key: string) => {
        if (key.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(oldCached);
      });

      const newEn = [makeNews({ id: 'new', published: '2026-02-01T00:00:00Z', language: 'en' })];
      http.get.mockImplementation((_, opts: any) => {
        const lang = opts.params.language;
        if (lang === 'en') return of({ data: { status: 'ok', news: newEn, page: 1 } });
        return of({ data: { status: 'ok', news: [], page: 1 } });
      });

      const result = await service.getLatestNews(1, true);
      expect(http.get).toHaveBeenCalledTimes(3);
      expect(result.news.some((n) => n.id === 'new')).toBe(true);
      expect(result.cached).toBe(false);
    });

    it('atualização repetida respeita proteção cooldown', async () => {
      const cached: ResponseNews = {
        status: 'ok',
        page: 1,
        news: [makeNews({ id: 'cached', published: '2026-01-01T00:00:00Z' })],
        hasMore: true,
        count: 1,
        cached: true,
      };
      const now = Date.now();
      cache.get.mockImplementation((key: string) => {
        if (key.endsWith(':lastRefresh')) return Promise.resolve(now); // acabou de atualizar
        return Promise.resolve(cached);
      });

      const result = await service.getLatestNews(1, true);
      expect(http.get).not.toHaveBeenCalled();
      expect(result.cached).toBe(true);
      expect(result.news[0].id).toBe('cached');
    });

    it('atualização forçada após cooldown faz nova consulta', async () => {
      const cached: ResponseNews = {
        status: 'ok',
        page: 1,
        news: [makeNews({ id: 'old', published: '2026-01-01T00:00:00Z' })],
        hasMore: true,
        count: 1,
        cached: true,
      };
      const oldTs = Date.now() - 61 * 1000; // 61s atrás, fora cooldown 60s
      cache.get.mockImplementation((key: string) => {
        if (key.endsWith(':lastRefresh')) return Promise.resolve(oldTs);
        return Promise.resolve(cached);
      });
      const fresh = [makeNews({ id: 'fresh', published: '2026-03-01T00:00:00Z' })];
      http.get.mockImplementation((_, opts: any) => {
        if (opts.params.language === 'en') return of({ data: { status: 'ok', news: fresh, page: 1 } });
        return of({ data: { status: 'ok', news: [], page: 1 } });
      });

      const result = await service.getLatestNews(1, true);
      expect(http.get).toHaveBeenCalledTimes(3);
      expect(result.news.some((n) => n.id === 'fresh')).toBe(true);
    });
  });

  describe('check-updates', () => {
    it('detecta notícia nova', async () => {
      const now = new Date().toISOString();
      const old = new Date(Date.now() - 100000).toISOString();
      const cached: ResponseNews = {
        status: 'ok',
        page: 1,
        news: [
          makeNews({ id: '1', published: now }),
          makeNews({ id: '2', published: old }),
        ],
        hasMore: true,
        count: 2,
        cached: true,
      };
      cache.get.mockImplementation((key: string) => {
        if (key.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(cached);
      });

      const result = await service.checkUpdates(old);
      expect(result.hasNew).toBe(true);
      expect(result.count).toBe(1);
    });

    it('nenhuma notícia nova', async () => {
      const old = new Date(Date.now() - 100000).toISOString();
      const older = new Date(Date.now() - 200000).toISOString();
      const cached: ResponseNews = {
        status: 'ok',
        page: 1,
        news: [makeNews({ id: '1', published: older })],
        hasMore: true,
        count: 1,
        cached: true,
      };
      cache.get.mockResolvedValue(cached);
      const result = await service.checkUpdates(old);
      expect(result.hasNew).toBe(false);
      expect(result.count).toBe(0);
    });

    it('data inválida retorna hasNew false sem quebrar', async () => {
      const cached: ResponseNews = {
        status: 'ok',
        page: 1,
        news: [makeNews({ id: '1', published: new Date().toISOString() })],
        hasMore: true,
        count: 1,
        cached: true,
      };
      cache.get.mockResolvedValue(cached);
      const r1 = await service.checkUpdates('invalid-date');
      expect(r1.hasNew).toBe(false);
      const r2 = await service.checkUpdates('');
      expect(r2.hasNew).toBe(false);
      const r3 = await service.checkUpdates(undefined as unknown as string);
      expect(r3.hasNew).toBe(false);
    });

    it('cache: reutiliza dados de getLatestNews(1)', async () => {
      const cached: ResponseNews = {
        status: 'ok',
        page: 1,
        news: [makeNews({ id: '1', published: new Date().toISOString() })],
        hasMore: true,
        count: 1,
        cached: true,
      };
      cache.get.mockImplementation((key) => {
        if (key === 'latest-news-bilingual-page-1') return Promise.resolve(cached);
        return Promise.resolve(null);
      });
      const result = await service.checkUpdates(new Date(Date.now() - 1000).toISOString());
      expect(cache.get).toHaveBeenCalledWith('latest-news-bilingual-page-1');
      expect(result.hasNew).toBe(true);
    });
  });

  describe('Ordenação', () => {
    it('notícias retornam em ordem determinística (mais recentes primeiro)', async () => {
      cache.get.mockImplementation((k: string) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      const n1 = makeNews({ id: '1', published: '2026-01-01T10:00:00Z', language: 'en' });
      const n2 = makeNews({ id: '2', published: '2026-01-03T10:00:00Z', language: 'pt' });
      const n3 = makeNews({ id: '3', published: '2026-01-02T10:00:00Z', language: 'es' });
      http.get.mockImplementation((_, opts: any) => {
        const lang = opts.params.language;
        if (lang === 'en') return of({ data: { status: 'ok', news: [n1], page: 1 } });
        if (lang === 'pt') return of({ data: { status: 'ok', news: [n2], page: 1 } });
        if (lang === 'es') return of({ data: { status: 'ok', news: [n3], page: 1 } });
        return of({ data: { status: 'ok', news: [], page: 1 } });
      });
      const result = await service.getLatestNews(1, false);
      expect(result.news.map((n) => n.id)).toEqual(['2', '3', '1']);
    });

    it('notícia nova aparece na posição esperada (topo)', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      const old = makeNews({ id: 'old', published: '2026-01-01T00:00:00Z' });
      const newest = makeNews({ id: 'newest', published: '2026-12-31T23:59:59Z' });
      http.get.mockImplementation((_, opts: any) => {
        if (opts.params.language === 'en') return of({ data: { status: 'ok', news: [old, newest], page: 1 } });
        return of({ data: { status: 'ok', news: [], page: 1 } });
      });
      const result = await service.getLatestNews(1);
      expect(result.news[0].id).toBe('newest');
    });

    it('datas inválidas não quebram o feed e vão para o final', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      const valid = makeNews({ id: 'valid', published: '2026-06-01T00:00:00Z' });
      const invalid = makeNews({ id: 'invalid', published: 'not-a-date' });
      http.get.mockImplementation((_, opts: any) => {
        if (opts.params.language === 'en') return of({ data: { status: 'ok', news: [invalid, valid], page: 1 } });
        return of({ data: { status: 'ok', news: [], page: 1 } });
      });
      const result = await service.getLatestNews(1);
      expect(result.news[0].id).toBe('valid');
      expect(result.news[1].id).toBe('invalid');
    });
  });

  describe('Paginação', () => {
    it('primeira página retorna dados com hasMore e count', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      const news = [makeNews({ id: '1', published: new Date().toISOString() })];
      http.get.mockReturnValue(of({ data: { status: 'ok', news, page: 1 } }));
      const result = await service.getLatestNews(1);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(true);
      expect(result.count).toBe(1);
    });

    it('próxima página usa chave de cache distinta', async () => {
      cache.get.mockImplementation((k: string) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      http.get.mockReturnValue(of({ data: { status: 'ok', news: [makeNews({ id: 'p2', published: new Date().toISOString() })], page: 2 } }));
      const result = await service.getLatestNews(2);
      expect(result.page).toBe(2);
      expect(cache.get).toHaveBeenCalledWith('latest-news-bilingual-page-2');
    });

    it('página vazia retorna hasMore false e count 0', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      http.get.mockReturnValue(of({ data: { status: 'ok', news: [], page: 99 } }));
      const result = await service.getLatestNews(99);
      expect(result.news.length).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.count).toBe(0);
    });

    it('fim da paginação — hasMore false quando vazio', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      http.get.mockReturnValue(of({ data: { status: 'ok', news: [], page: 5 } }));
      const r = await service.getLatestNews(5);
      expect(r.hasMore).toBe(false);
    });

    it('consistência: deduplicação evita duplicatas entre idiomas', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      const dupUrl = 'https://example.com/dup';
      const enDup = makeNews({ id: '1', url: dupUrl, published: '2026-01-02T00:00:00Z', language: 'en' });
      const ptDup = makeNews({ id: '2', url: dupUrl, published: '2026-01-02T00:00:00Z', language: 'pt' });
      http.get.mockImplementation((_, opts: any) => {
        if (opts.params.language === 'en') return of({ data: { status: 'ok', news: [enDup], page: 1 } });
        if (opts.params.language === 'pt') return of({ data: { status: 'ok', news: [ptDup], page: 1 } });
        return of({ data: { status: 'ok', news: [], page: 1 } });
      });
      const result = await service.getLatestNews(1);
      expect(result.count).toBe(1);
      expect(result.news.length).toBe(1);
    });
  });

  describe('Imagens', () => {
    it('imagem válida é preservada', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      const img = 'https://example.com/valid.jpg';
      const n = makeNews({ id: '1', image: img, published: new Date().toISOString() });
      http.get.mockReturnValue(of({ data: { status: 'ok', news: [n], page: 1 } }));
      const result = await service.getLatestNews(1);
      expect(result.news[0].image).toBe(img);
    });

    it('ausência de imagem retorna null', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      for (const val of ['', '   ', null as unknown as string, undefined as unknown as string]) {
        const n = makeNews({ id: '1', image: val as string, published: new Date().toISOString() });
        http.get.mockReturnValue(of({ data: { status: 'ok', news: [n], page: 1 } }));
        const r = await service.getLatestNews(1);
        expect(r.news[0].image).toBeNull();
        jest.clearAllMocks();
        cache.get.mockImplementation((k) => {
          if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
          return Promise.resolve(null);
        });
      }
    });

    it('TugaTech: "None" retorna null', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      const cases = ['None', 'none', 'NONE', ' None '];
      for (const c of cases) {
        const n = makeNews({ id: '1', image: c, published: new Date().toISOString(), author: 'TugaTech' });
        http.get.mockReturnValue(of({ data: { status: 'ok', news: [n], page: 1 } }));
        const r = await service.getLatestNews(1);
        expect(r.news[0].image).toBeNull();
        jest.clearAllMocks();
        cache.get.mockImplementation((k) => {
          if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
          return Promise.resolve(null);
        });
      }
    });

    it('URL inválida retorna null', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      const invalids = ['not-a-url', 'ftp://example.com/img.jpg', 'www.example.com/img.jpg', 'None', 'null'];
      for (const inv of invalids) {
        const n = makeNews({ id: '1', image: inv, published: new Date().toISOString() });
        http.get.mockReturnValue(of({ data: { status: 'ok', news: [n], page: 1 } }));
        const r = await service.getLatestNews(1);
        expect(r.news[0].image).toBeNull();
        jest.clearAllMocks();
        cache.get.mockImplementation((k) => {
          if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
          return Promise.resolve(null);
        });
      }
    });
  });

  describe('Erros', () => {
    it('fonte externa indisponível: uma língua falha mas retorna parcial', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      const ptNews = [makeNews({ id: 'pt1', published: new Date().toISOString(), language: 'pt' })];
      http.get.mockImplementation((_, opts: any) => {
        if (opts.params.language === 'en') return throwError(() => new Error('timeout'));
        if (opts.params.language === 'pt') return of({ data: { status: 'ok', news: ptNews, page: 1 } });
        if (opts.params.language === 'es') return throwError(() => new Error('network'));
        return throwError(() => new Error('fail'));
      });
      const result = await service.getLatestNews(1);
      expect(result.news.length).toBe(1);
      expect(result.news[0].language).toBe('pt');
      expect(result.cached).toBe(false);
    });

    it('timeout: todas falham e há cache — retorna cache stale', async () => {
      const cached: ResponseNews = {
        status: 'ok',
        page: 1,
        news: [makeNews({ id: 'cached', published: new Date().toISOString() })],
        hasMore: true,
        count: 1,
        cached: true,
      };
      cache.get.mockImplementation((k: string) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(cached);
      });
      http.get.mockReturnValue(throwError(() => new Error('timeout')));
      const result = await service.getLatestNews(1, true); // force mas todas falham
      // Como há cache e ocorreu erro, deve retornar cache (fallback)
      // No caso de forceRefresh com cooldown não atingido, já retornaria cache antes, mas aqui cooldown null então tenta fetch e falha
      // Nossa implementação tenta fetch e no catch retorna cache
      expect(result.news[0].id).toBe('cached');
      expect(result.cached).toBe(true);
    });

    it('resposta inválida sem news: trata como vazio', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      http.get.mockReturnValue(of({ data: { status: 'ok', news: null as unknown as TypeNews[], page: 1 } as any }));
      const result = await service.getLatestNews(1);
      expect(result.news.length).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('sem cache e todas falham lança 500', async () => {
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      http.get.mockReturnValue(throwError(() => new Error('fail')));
      await expect(service.getLatestNews(1)).rejects.toThrow('Erro ao buscar notícias');
    });

    it('cache disponível durante falha: getLatestNews retorna stale', async () => {
      const cached: ResponseNews = {
        status: 'ok',
        page: 1,
        news: [makeNews({ id: 'stale', published: new Date().toISOString() })],
        hasMore: true,
        count: 1,
        cached: true,
      };
      cache.get.mockImplementation((k) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(null);
        // primeira chamada para cacheKey retorna cached, mas para simular miss seguido de falha,
        // precisamos que primeira chamada para cacheKey retorne null e depois de falha retornaria?
        // Neste teste vamos simular que há cache e fetch falha — deve retornar cache
        return Promise.resolve(cached);
      });
      // força refresh para tentar fetch mesmo com cache existente, mas com cooldown liberado
      cache.get.mockImplementation((k: string) => {
        if (k.endsWith(':lastRefresh')) return Promise.resolve(Date.now() - 70000);
        return Promise.resolve(cached);
      });
      http.get.mockReturnValue(throwError(() => new Error('error')));
      const result = await service.getLatestNews(1, true);
      expect(result.cached).toBe(true);
    });
  });
});
