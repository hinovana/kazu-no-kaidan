const searchInput = document.querySelector("#tsd-search-input");

if (searchInput instanceof HTMLInputElement) {
  searchInput.placeholder = "リファレンスを検索";
  searchInput.setAttribute("aria-label", "リファレンスを検索");
}
