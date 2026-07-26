/**
 * 旧教材URLへのアクセスを、現在のSPA Hash URLへ転送する互換入口。
 *
 * @packageDocumentation
 */

export {};

const spaUrl = new URL("../../", window.location.href);
spaUrl.hash = `/generators/onaji-no-tsunagi${window.location.search}`;
window.location.replace(spaUrl);
