import { Test, TestingModule } from "@nestjs/testing";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { NewsService, TypeNews } from "./news.service";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { of } from "rxjs";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CheckUpdatesDto } from "./dto/check-updates.dto";

function makeNews(o: Partial<TypeNews> & {id:string}): TypeNews {
  return { title:"t", description:"d", url:"https://example.com/"+o.id, author:"a", image:"https://example.com/img.jpg", language:"en", category:["science_technology"], source_category:[], published:new Date().toISOString(), ...o };
}

describe("checkUpdates languages", () => {
  let service: NewsService; let cache:any; let http:any; let config:any;
  beforeEach(async () => {
    cache={get:jest.fn(), set:jest.fn().mockResolvedValue(undefined)};
    http={get:jest.fn()}; config={get:jest.fn().mockReturnValue("fake-key")};
    const m=await Test.createTestingModule({providers:[NewsService,{provide:CACHE_MANAGER,useValue:cache},{provide:HttpService,useValue:http},{provide:ConfigService,useValue:config}]}).compile();
    service=m.get<NewsService>(NewsService);
  });
  afterEach(()=>jest.clearAllMocks());

  it("Caso 1 pt", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    const ptNews=[makeNews({id:"pt1",language:"pt",published:new Date(Date.now()+10000).toISOString()})];
    http.get.mockImplementation((_,opts:any)=> opts.params.language==="pt" ? of({data:{status:"ok",news:ptNews,page:1}}) : of({data:{status:"ok",news:[],page:1}}));
    const r=await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt"]);
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(r.hasNew).toBe(true);
  });
  it("Caso 2 en", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    const enNews=[makeNews({id:"en1",language:"en",published:new Date(Date.now()+10000).toISOString()})];
    http.get.mockImplementation((_,opts:any)=> opts.params.language==="en" ? of({data:{status:"ok",news:enNews,page:1}}) : of({data:{status:"ok",news:[],page:1}}));
    const r=await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["en"]);
    expect(http.get).toHaveBeenCalledTimes(1);
  });
  it("Caso 3 es", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    const esNews=[makeNews({id:"es1",language:"es",published:new Date(Date.now()+10000).toISOString()})];
    http.get.mockImplementation((_,opts:any)=> opts.params.language==="es" ? of({data:{status:"ok",news:esNews,page:1}}) : of({data:{status:"ok",news:[],page:1}}));
    const r=await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["es"]);
    expect(http.get).toHaveBeenCalledTimes(1);
  });
  it("Caso 4 pt,en", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    const ptNews=[makeNews({id:"pt1",language:"pt",published:new Date(Date.now()+10000).toISOString()})];
    const enNews=[makeNews({id:"en1",language:"en",published:new Date(Date.now()+10000).toISOString()})];
    http.get.mockImplementation((_,opts:any)=>{
      if(opts.params.language==="pt") return of({data:{status:"ok",news:ptNews,page:1}});
      if(opts.params.language==="en") return of({data:{status:"ok",news:enNews,page:1}});
      return of({data:{status:"ok",news:[],page:1}});
    });
    const r=await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt","en"]);
    expect(http.get).toHaveBeenCalledTimes(2);
    expect(r.count).toBe(2);
  });
  it("Caso 5 pt,es", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[makeNews({id:"1",language:"pt",published:new Date(Date.now()+10000).toISOString()})],page:1}}));
    const r=await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt","es"]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it("Caso 6 en,es", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[makeNews({id:"1",language:"en",published:new Date(Date.now()+10000).toISOString()})],page:1}}));
    const r=await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["en","es"]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it("Caso 7 pt,en,es", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[makeNews({id:"1",language:"pt",published:new Date(Date.now()+10000).toISOString()})],page:1}}));
    const r=await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt","en","es"]);
    expect(http.get).toHaveBeenCalledTimes(3);
  });
  it("Caso 8 duplicado pt,pt,en sem duplicada", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt","pt","en"]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it("Caso 9 invalido pt,fr DTO", async () => {
    const dto=plainToInstance(CheckUpdatesDto,{after:new Date().toISOString(), languages:"pt,fr"});
    const errors=await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
  it("Caso 10 sem languages default 3", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.checkUpdates(new Date(Date.now()-100000).toISOString(), undefined);
    expect(http.get).toHaveBeenCalledTimes(3);
    jest.clearAllMocks();
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.checkUpdates(new Date(Date.now()-100000).toISOString());
    expect(http.get).toHaveBeenCalledTimes(3);
  });
  it("Caso 11 cache nao mistura pt vs pt,en", async () => {
    const ptNews=[makeNews({id:"pt1",language:"pt",published:new Date(Date.now()+10000).toISOString()})];
    const cachedPt:any={status:"ok",page:1,news:ptNews,hasMore:true,count:1,cached:true};
    cache.get.mockImplementation((key:string)=>{
      if(key==="check-updates:page:1:langs:pt") return Promise.resolve(cachedPt);
      if(key.includes("lastRefresh")) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    const rPt=await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt"]);
    expect(rPt.hasNew).toBe(true);
    expect(http.get).not.toHaveBeenCalled();
    jest.clearAllMocks();
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt","en"]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it("Caso 12 erro parcial pt ok es fail", async () => {
    cache.get.mockImplementation((k:string)=>k.includes("lastRefresh")?Promise.resolve(null):Promise.resolve(null));
    const ptNews=[makeNews({id:"pt1",language:"pt",published:new Date(Date.now()+10000).toISOString()})];
    const {throwError}=require("rxjs");
    http.get.mockImplementation((_,opts:any)=>{
      if(opts.params.language==="pt") return of({data:{status:"ok",news:ptNews,page:1}});
      return throwError(()=>new Error("fail"));
    });
    const r=await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt","es"]);
    expect(r.hasNew).toBe(true);
  });
});
