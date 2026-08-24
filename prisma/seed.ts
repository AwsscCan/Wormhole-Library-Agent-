/**
 * Prisma seed（队友01）— 把 data/*.json 灌入 SQLite。
 * 队友们扩充 data/ 后重跑 `npm run db:seed` 即可，脚本不用改。
 */
import { PrismaClient } from "@prisma/client";
import conceptsSeed from "../data/seed-concepts.json";
import edgesSeed from "../data/seed-edges.json";
import resourcesSeed from "../data/seed-resources.json";
import livingBooksSeed from "../data/seed-living-books.json";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 清空（顺序考虑外键）
  await prisma.contactRequest.deleteMany();
  await prisma.personMatch.deleteMany();
  await prisma.wormholePath.deleteMany();
  await prisma.wormholeRun.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.userMemory.deleteMany();
  await prisma.livingBookConcept.deleteMany();
  await prisma.livingBookProfile.deleteMany();
  await prisma.resourceConcept.deleteMany();
  await prisma.libraryResource.deleteMany();
  await prisma.conceptEdge.deleteMany();
  await prisma.concept.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  // demo user
  const demoUser = await prisma.user.create({
    data: { id: "demo-user", name: "Demo User", email: "demo-user@wormhole.local" },
  });

  // demo 用户预置记忆（设计文档要求 3 条）
  await prisma.userMemory.createMany({
    data: [
      {
        userId: demoUser.id,
        category: "reading",
        key: "language",
        valueJson: JSON.stringify("zh_first"),
        confidence: 0.7,
        source: "profile",
      },
      {
        userId: demoUser.id,
        category: "difficulty",
        key: "preferredLevel",
        valueJson: JSON.stringify("undergrad"),
        confidence: 0.6,
        source: "profile",
      },
      {
        userId: demoUser.id,
        category: "serendipity",
        key: "defaultSlider",
        valueJson: JSON.stringify(50),
        confidence: 0.5,
        source: "system_inferred",
      },
    ],
  });

  // concepts
  for (const c of conceptsSeed.concepts) {
    await prisma.concept.create({
      data: {
        id: c.id,
        name: c.name,
        aliasesJson: JSON.stringify(c.aliases),
        domain: c.domain,
        description: c.description,
        popularity: c.popularity ?? 0.5,
      },
    });
  }

  // edges
  for (const e of edgesSeed.edges) {
    await prisma.conceptEdge.create({
      data: {
        fromConceptId: e.fromConceptId,
        toConceptId: e.toConceptId,
        relation: e.relation,
        weight: e.weight,
        explanation: e.explanation,
      },
    });
  }

  // resources
  for (const r of resourcesSeed.resources) {
    await prisma.libraryResource.create({
      data: {
        id: r.id,
        type: r.type,
        title: r.title,
        authorsJson: JSON.stringify(r.authors),
        year: r.year,
        language: r.language,
        abstract: r.abstract,
        location: r.location,
        callNumber: r.callNumber,
        availability: r.availability,
        difficulty: r.difficulty,
        qualityScore: r.qualityScore,
        concepts: {
          create: r.conceptIds.map((conceptId: string) => ({ conceptId })),
        },
      },
    });
  }

  // living books（每个人物挂一个虚构 user）
  for (const lb of livingBooksSeed.livingBooks) {
    const owner = await prisma.user.create({
      data: {
        name: `fictional-owner-${lb.id}`,
        email: `fictional-owner-${lb.id}@wormhole.local`,
      },
    });
    await prisma.livingBookProfile.create({
      data: {
        id: lb.id,
        userId: owner.id,
        displayName: lb.displayName,
        displayMode: lb.displayMode,
        bio: lb.bio,
        expertiseLevel: lb.expertiseLevel,
        willingTypesJson: JSON.stringify(lb.willingTypes),
        consentState: lb.consentState,
        concepts: {
          create: lb.conceptIds.map((conceptId: string) => ({
            conceptId,
            relation: "expertise",
          })),
        },
      },
    });
  }

  const counts = {
    concepts: await prisma.concept.count(),
    edges: await prisma.conceptEdge.count(),
    resources: await prisma.libraryResource.count(),
    livingBooks: await prisma.livingBookProfile.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
