const CITIZEN_SIGNUP_HOSTS = new Set([
  'yonginsun.kr',
  'www.yonginsun.kr'
]);

const CITIZEN_SIGNUP_TITLE = '조합원 가입 | 용인시민햇빛발전협동조합';
const CITIZEN_SIGNUP_DESCRIPTION = '용인시민햇빛발전협동조합 조합원 가입 신청 페이지입니다.';
const CITIZEN_SIGNUP_URL = 'https://yonginsun.kr/signup';

class TextContentHandler {
  constructor(content) {
    this.content = content;
  }

  element(element) {
    element.setInnerContent(this.content);
  }
}

class AttributeContentHandler {
  constructor(attribute, content) {
    this.attribute = attribute;
    this.content = content;
  }

  element(element) {
    element.setAttribute(this.attribute, this.content);
  }
}

class RemoveElementHandler {
  element(element) {
    element.remove();
  }
}

function isCitizenSignupRequest(url) {
  const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
  return CITIZEN_SIGNUP_HOSTS.has(url.hostname.toLowerCase())
    && normalizedPath === '/signup';
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const url = new URL(request.url);
    const contentType = response.headers.get('content-type') || '';

    if (!isCitizenSignupRequest(url) || !contentType.includes('text/html')) {
      return response;
    }

    return new HTMLRewriter()
      .on('title', new TextContentHandler(CITIZEN_SIGNUP_TITLE))
      .on('link[rel="canonical"]', new AttributeContentHandler('href', CITIZEN_SIGNUP_URL))
      .on('meta[name="description"]', new AttributeContentHandler('content', CITIZEN_SIGNUP_DESCRIPTION))
      .on('meta[property="og:title"]', new AttributeContentHandler('content', CITIZEN_SIGNUP_TITLE))
      .on('meta[property="og:description"]', new AttributeContentHandler('content', CITIZEN_SIGNUP_DESCRIPTION))
      .on('meta[property="og:url"]', new AttributeContentHandler('content', CITIZEN_SIGNUP_URL))
      .on('meta[name="twitter:title"]', new AttributeContentHandler('content', CITIZEN_SIGNUP_TITLE))
      .on('meta[name="twitter:description"]', new AttributeContentHandler('content', CITIZEN_SIGNUP_DESCRIPTION))
      .on('meta[property="og:image"]', new RemoveElementHandler())
      .on('meta[name="twitter:image"]', new RemoveElementHandler())
      .transform(response);
  }
};
