import { BskyAgent } from "@atproto/api";

let agent: BskyAgent | null = null;

async function getAgent(): Promise<BskyAgent> {
  if (!agent) {
    const identifier = process.env.BLUESKY_USERNAME;
    const password = process.env.BLUESKY_PASSWORD;

    if (!identifier || !password) {
      throw new Error("Missing Bluesky credentials");
    }

    agent = new BskyAgent({ service: "https://bsky.social" });
    await agent.login({ identifier, password });
  }
  return agent;
}

export async function postToBluesky(text: string): Promise<string | null> {
  try {
    const a = await getAgent();
    const post = await a.post({ text });
    console.log(`[bluesky] Post created: ${post.uri}`);
    return post.uri;
  } catch (error) {
    console.error("[bluesky] Failed to post:", error);
    return null;
  }
}
