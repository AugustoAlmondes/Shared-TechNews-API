/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars, @typescript-eslint/no-require-imports */

import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NewsService, TypeNews } from './news.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { GetNewsDto } from './dto/get-news.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

function makeNews(o: Partial<TypeNews> & {id:string}): TypeNews {
  return { title:'t', description:'d', url:'https://example.com/'+o.id, author:'a', image:'https://example.com/img.jpg', language:'en', category:['science_technology'], source_category:[], published:new Date().toISOString(), ...o };
}
describe('Languages', () => {
  let service: NewsService; let cache:any; let http:any; let config:any;
  beforeEach(async () => {
    cache={get:jest.fn(), set:jest.fn().mockResolvedValue(undefined)};
    http={get:jest.fn()}; config={get:jest.fn().mockReturnValue('fake-key')};
    const m=await Test.createTestingModule({providers:[NewsService,{provide:CACHE_MANAGER,useValue:cache},{provide:HttpService,useValue:http},{provide:ConfigService,useValue:config}]}).compile();
    service=m.get<NewsService>(NewsService);
  });
  afterEach(()=>jest.clearAllMocks());

  it("Teste 1: sem languages deve usar en+pt+es (3 req)", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,undefined);
    expect(http.get).toHaveBeenCalledTimes(3);
    const langs=http.get.mock.calls.map((c:any)=>c[1].params.language).sort();
    expect(langs).toEqual(["en","es","pt"]);
  });
  it("Teste 2: languages=pt somente pt", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,["pt"]);
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get.mock.calls[0][1].params.language).toBe("pt");
  });
  it("Teste 3: languages=en somente en", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,["en"]);
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get.mock.calls[0][1].params.language).toBe("en");
  });
  it("Teste 4: languages=es somente es", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,["es"]);
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get.mock.calls[0][1].params.language).toBe("es");
  });
  it("Teste 5: languages=pt,en 2 req", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,["pt","en"]);
    expect(http.get).toHaveBeenCalledTimes(2);
    const langs=http.get.mock.calls.map((c:any)=>c[1].params.language).sort();
    expect(langs).toEqual(["en","pt"]);
  });
  it("Teste 6: languages=pt,es 2 req", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,["pt","es"]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it("Teste 7: languages=en,es 2 req", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,["en","es"]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it("Teste 8: languages=pt,en,es 3 req", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,["pt","en","es"]);
    expect(http.get).toHaveBeenCalledTimes(3);
  });
  it("Teste 9: ordem pt,en e en,pt mesma chave", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[makeNews({id:"1",published:new Date().toISOString()})],page:1}}));
    await service.getLatestNews(1,false,["pt","en"]);
    const first=http.get.mock.calls.map((c:any)=>c[1].params.language).sort();
    jest.clearAllMocks();
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[makeNews({id:"1",published:new Date().toISOString()})],page:1}}));
    await service.getLatestNews(1,false,["en","pt"]);
    const second=http.get.mock.calls.map((c:any)=>c[1].params.language).sort();
    expect(first).toEqual(second);
    expect(first).toEqual(["en","pt"]);
  });
  it("Teste 10: cache isolado pt+en vs pt+es", async () => {
    const cached={status:"ok",page:1,news:[makeNews({id:"pten",published:new Date().toISOString(),language:"pt"})],hasMore:true,count:1,cached:true};
    cache.get.mockImplementation((key:string)=>{
      if(key==="latest-news:page:1:langs:en-pt") return Promise.resolve(cached);
      if(key.includes("lastRefresh")) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    const hit=await service.getLatestNews(1,false,["pt","en"]);
    expect(hit.news[0].id).toBe("pten");
    expect(http.get).not.toHaveBeenCalled();
    jest.clearAllMocks();
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,["pt","es"]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it("Teste 11: cache compartilhado pt+en e en,pt", async () => {
    const cached={status:"ok",page:1,news:[makeNews({id:"shared",published:new Date().toISOString()})],hasMore:true,count:1,cached:true};
    cache.get.mockImplementation((key:string)=>{
      if(key==="latest-news:page:1:langs:en-pt") return Promise.resolve(cached);
      if(key.includes("lastRefresh")) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    const r1=await service.getLatestNews(1,false,["pt","en"]);
    expect(r1.news[0].id).toBe("shared");
    expect(http.get).not.toHaveBeenCalled();
    jest.clearAllMocks();
    cache.get.mockImplementation((key:string)=>{
      if(key==="latest-news:page:1:langs:en-pt") return Promise.resolve(cached);
      if(key.includes("lastRefresh")) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    const r2=await service.getLatestNews(1,false,["en","pt"]);
    expect(r2.news[0].id).toBe("shared");
    expect(http.get).not.toHaveBeenCalled();
  });
  it("Teste 12: refresh isolado pt+en vs pt+es", async () => {
    const cached={status:"ok",page:1,news:[makeNews({id:"cached",published:new Date().toISOString()})],hasMore:true,count:1,cached:true};
    const now=Date.now();
    cache.get.mockImplementation((key:string)=>{
      if(key.endsWith(":lastRefresh") && key.includes("en-pt")) return Promise.resolve(now);
      if(key==="latest-news:page:1:langs:en-pt") return Promise.resolve(cached);
      return Promise.resolve(null);
    });
    const rCooldown=await service.getLatestNews(1,true,["pt","en"]);
    expect(rCooldown.cached).toBe(true);
    expect(http.get).not.toHaveBeenCalled();
    jest.clearAllMocks();
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,true,["pt","es"]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it("Teste 13: idioma invalido fr rejeitado no DTO", async () => {
    const dto=plainToInstance(GetNewsDto,{languages:"fr"});
    const errors=await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe("languages");
  });
  it("Teste 14: pt,fr invalido", async () => {
    const dto=plainToInstance(GetNewsDto,{languages:"pt,fr"});
    const errors=await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
  it("Teste 15: mais de 3 rejeitado", async () => {
    const dto=plainToInstance(GetNewsDto,{languages:"pt,en,es,fr"});
    const errors=await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
  it("Teste 16: duplicidade pt,pt -> pt", async () => {
    const dto=plainToInstance(GetNewsDto,{languages:"pt,pt"});
    const errors=await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.languages).toEqual(["pt"]);
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,dto.languages);
    expect(http.get).toHaveBeenCalledTimes(1);
  });
  it("Teste 17: falha parcial pt ok en fail", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    const ptNews=[makeNews({id:"pt1",published:new Date().toISOString(),language:"pt"})];
    const {throwError}=require("rxjs");
    http.get.mockImplementation((_,opts:any)=>{
      if(opts.params.language==="pt") return of({data:{status:"ok",news:ptNews,page:1}});
      return throwError(()=>new Error("fail"));
    });
    const result=await service.getLatestNews(1,false,["pt","en"]);
    expect(result.news.length).toBe(1);
    expect(result.news[0].language).toBe("pt");
  });
  it("Teste 18: todas falham -> fallback stale ou 500", async () => {
    const {throwError}=require("rxjs");
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(throwError(()=>new Error("fail")));
    await expect(service.getLatestNews(1,false,["pt"])).rejects.toThrow("Erro ao buscar notícias");
    const cached={status:"ok",page:1,news:[makeNews({id:"stale",published:new Date().toISOString()})],hasMore:true,count:1,cached:true};
    cache.get.mockImplementation((k:string)=>{
      if(k.includes("lastRefresh")) return Promise.resolve(null);
      return Promise.resolve(cached);
    });
    http.get.mockReturnValue(throwError(()=>new Error("fail")));
    const fb=await service.getLatestNews(1,false,["pt"]);
    expect(fb.news[0].id).toBe("stale");
    expect(fb.cached).toBe(true);
  });
  describe("DTO Languages transform", () => {
    it("comma string para array", async () => {
      const dto=plainToInstance(GetNewsDto,{languages:"pt,en"});
      await validate(dto);
      expect(dto.languages).toEqual(["pt","en"]);
    });
    it("remove espacos e lower", async () => {
      const dto=plainToInstance(GetNewsDto,{languages:" PT , EN "});
      await validate(dto);
      expect(dto.languages).toEqual(["pt","en"]);
    });
    it("filtra vazios pt,,en", async () => {
      const dto=plainToInstance(GetNewsDto,{languages:"pt,,en"});
      await validate(dto);
      expect(dto.languages).toEqual(["pt","en"]);
    });
    it("sem languages usa undefined (service default)", async () => {
      const dto=plainToInstance(GetNewsDto,{});
      await validate(dto);
      expect(dto.languages).toBeUndefined();
    });
  });
});

