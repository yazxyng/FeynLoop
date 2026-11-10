// 운영 환경에서는 명시적으로 허용한 경우에만 비로그인 데모 API를 엽니다.
export function demoAllowed() {
  return (
    process.env.ALLOW_DEMO === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEMO !== "false")
  );
}
