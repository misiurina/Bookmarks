function folder(id, title, children) {
  return { id, title, children };
}

function link(id, title, url) {
  return { id, title, url };
}

// Used only when this page is opened outside the extension, so the layout
// can be reviewed without the bookmarks API.
export function createFixtureRoots() {
  return [
    folder("1", "Bookmarks bar", [
      folder("10", "Work", [
        link("11", "Mail", "https://mail.example.com/inbox"),
        link("12", "Calendar", "https://calendar.example.com"),
        link("13", "Notes", "https://notes.example.com/home"),
      ]),
      folder("20", "Reading", [
        link("21", "A long article title that should stay on one line and ellipsize cleanly", "https://en.wikipedia.org/wiki/Reading"),
        link("22", "Essays", "https://example.com/essays"),
        folder("23", "Later", []),
        folder("24", "References", [
          link("25", "Dictionary", "https://www.dictionary.example/browse"),
          link("26", "Maps", "https://maps.example.com"),
        ]),
      ]),
      link("30", "News", "https://news.example.com"),
      link("31", "Weather", "https://weather.example.com"),
    ]),
    folder("2", "Other bookmarks", [
      folder("40", "Travel", [
        link("41", "Trains", "https://trains.example.com"),
        link("42", "City guide", "https://guide.example.com/cities"),
      ]),
      link("43", "Recipes", "https://recipes.example.com"),
    ]),
    folder("3", "Mobile bookmarks", [
      link("50", "Saved from phone", "https://example.com/mobile"),
    ]),
  ];
}
