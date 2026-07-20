const spaUrl = new URL("../../", window.location.href);
spaUrl.hash = `/generators/kokugo-no-tane${window.location.search}`;
window.location.replace(spaUrl);
