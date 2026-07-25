export {};

const spaUrl = new URL("../../", window.location.href);
spaUrl.hash = `/generators/onaji-no-tsunagi${window.location.search}`;
window.location.replace(spaUrl);
