Exercise catalog source: https://github.com/yuhonas/free-exercise-db

`catalog.json` is a reduced snapshot of `dist/exercises.json` retrieved on 2026-10-10 (876 exercises). It retains names, IDs, equipment, muscle groups, categories and image paths. The upstream project publishes its dataset under the Unlicense; see `LICENSE.txt` in this directory.

Photographs load from the upstream project's public image paths, with jsDelivr as a fallback. The catalog itself is bundled with the application and requires no API key or remote search request. Exercise names are kept as published; muscle and equipment labels and search aliases are localized in the application.
