import { Test, TestingModule } from "@nestjs/testing";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { NewsService } from "./news.service";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { of } from "rxjs";

describe("Cache TTL", () => {
  let service: NewsService; let cache:any; let http:any; let config:any;
  beforeEach(async () => {
    cache={get:jest.fn().mockResolvedValue(null), set:jest.fn().mockResolvedValue(undefined)};
    http={get:jest.fn().mockReturnValue(of({data:{status:"ok",news:[],page:1}}))};
    config={get:jest.fn().mockReturnValue("fake-key")};
    const m=await Test.createTestingModule({providers:[NewsService,{provide:CACHE_MANAGER,useValue:cache},{provide:HttpService,useValue:http},{provide:ConfigService,useValue:config}]}).compile();
    service=m.get<NewsService>(NewsService);
  });
  it("TESTE 1: GET /news usa TTL 15min", async () => {
    await service.getLatestNews(1,false,["pt"]);
    const setCalls = cache.set.mock.calls;
    const newsCall = setCalls.find((c:any)=>c[0].includes("latest-news:page:"));
    expect(newsCall).toBeDefined();
    expect(newsCall[2]).toBe(15*60*1000);
  });
  it("TESTE 2: check-updates usa TTL 5min", async () => {
    const future = new Date(Date.now()+100000).toISOString();
    http.get.mockReturnValue(of({data:{status:"ok",news:[{id:"1",title:"t",description:"d",url:"https://example.com/1",author:"a",image:"https://example.com/img.jpg",language:"pt",category:["science_technology"],source_category:[],published:future}],page:1}}));
    await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt"]);
    const setCalls = cache.set.mock.calls;
    const checkCall = setCalls.find((c:any)=>c[0].includes("check-updates:page:"));
    expect(checkCall).toBeDefined();
    expect(checkCall[2]).toBe(5*60*1000);
  });
  it("TESTE 3: cache /news nao interfere check-updates", async () => {
    await service.getLatestNews(1,false,["pt"]);
    const newsKey = cache.set.mock.calls.find((c:any)=>c[0].includes("latest-news:page:"))[0];
    jest.clearAllMocks();
    cache.get.mockResolvedValue(null);
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt"]);
    const checkKey = cache.set.mock.calls.find((c:any)=>c[0].includes("check-updates:page:"))[0];
    expect(newsKey).not.toBe(checkKey);
  });
  it("TESTE 4: cache check-updates nao interfere /news", async () => {
    const future = new Date(Date.now()+100000).toISOString();
    http.get.mockReturnValue(of({data:{status:"ok",news:[{id:"1",title:"t",description:"d",url:"https://example.com/1",author:"a",image:"https://example.com/img.jpg",language:"pt",category:["science_technology"],source_category:[],published:future}],page:1}}));
    await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt"]);
    const checkKey = cache.set.mock.calls.find((c:any)=>c[0].includes("check-updates"))[0];
    jest.clearAllMocks();
    cache.get.mockResolvedValue(null);
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,["pt"]);
    const newsKey = cache.set.mock.calls.find((c:any)=>c[0].includes("latest-news:page:"))[0];
    expect(checkKey).not.toBe(newsKey);
  });
  it("TESTE 5: idiomas isolados pt vs pt,en", async () => {
    await service.getLatestNews(1,false,["pt"]);
    const keyPt = cache.set.mock.calls[0][0];
    jest.clearAllMocks();
    cache.get.mockResolvedValue(null);
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    await service.getLatestNews(1,false,["pt","en"]);
    const keyPtEn = cache.set.mock.calls[0][0];
    expect(keyPt).not.toBe(keyPtEn);
  });
  it("TESTE 6: after continua funcionando", async () => {
    const future = new Date(Date.now()+100000).toISOString();
    const past = new Date(Date.now()-100000).toISOString();
    http.get.mockReturnValue(of({data:{status:"ok",news:[{id:"1",title:"t",description:"d",url:"https://example.com/1",author:"a",image:"https://example.com/img.jpg",language:"pt",category:["science_technology"],source_category:[],published:future}],page:1}}));
    const r1 = await service.checkUpdates(past, ["pt"]);
    expect(r1.hasNew).toBe(true);
    const r2 = await service.checkUpdates(future, ["pt"]);
    expect(r2.hasNew).toBe(false);
  });
  it("TESTE 7: resposta {hasNew, count}", async () => {
    http.get.mockReturnValue(of({data:{status:"ok",news:[],page:1}}));
    const r = await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt"]);
    expect(r).toHaveProperty("hasNew");
    expect(r).toHaveProperty("count");
    expect(typeof r.hasNew).toBe("boolean");
    expect(typeof r.count).toBe("number");
  });
  it("TESTE 8: fallback stale preservado", async () => {
    const cached:any={status:"ok",page:1,news:[{id:"1",title:"t",description:"d",url:"https://example.com/1",author:"a",image:null,language:"pt",category:["science_technology"],source_category:[],published:new Date(Date.now()+10000).toISOString()}],hasMore:true,count:1,cached:true};
    cache.get.mockImplementation((key:string)=>{
      if(key.includes("check-updates:page:1:langs:pt")) return Promise.resolve(cached);
      return Promise.resolve(null);
    });
    const r = await service.checkUpdates(new Date(Date.now()-100000).toISOString(), ["pt"]);
    expect(r.hasNew).toBe(true);
  });
});
