export const runtime = "nodejs";

export async function GET(req: Request) {
  const required = Boolean(process.env.APP_ACCESS_PASSWORD);
  if (required) {
    const provided = req.headers.get("x-app-password");
    if (provided !== process.env.APP_ACCESS_PASSWORD) {
      return Response.json(
        { hasKey: Boolean(process.env.DASHSCOPE_API_KEY), passwordRequired: true, unlocked: false },
        { status: 401 }
      );
    }
  }
  return Response.json({
    hasKey: Boolean(process.env.DASHSCOPE_API_KEY),
    passwordRequired: required,
    unlocked: true,
  });
}
