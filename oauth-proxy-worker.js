const allowedPaths = new Map([
  ["/login/device/code", "https://github.com/login/device/code"],
  ["/login/oauth/access_token", "https://github.com/login/oauth/access_token"]
]);

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = env.ALLOWED_ORIGIN || "*";
  const allowOrigin = allowedOrigin === "*" || allowedOrigin === origin ? origin || "*" : allowedOrigin;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return Response.json({ message: "Only POST is supported." }, { status: 405, headers });
    }

    const url = new URL(request.url);
    const githubUrl = allowedPaths.get(url.pathname);
    if (!githubUrl) {
      return Response.json({ message: "Unsupported OAuth path." }, { status: 404, headers });
    }

    const response = await fetch(githubUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": request.headers.get("Content-Type") || "application/x-www-form-urlencoded"
      },
      body: await request.text()
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        ...headers,
        "Content-Type": response.headers.get("Content-Type") || "application/json"
      }
    });
  }
};
