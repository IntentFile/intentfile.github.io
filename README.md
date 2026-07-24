# intentfile.org

The website for the **Intent File Specification** — a vendor-neutral specification for
describing a whole application in a single declarative YAML file (`*.intent`), one altitude
above the models a generator produces from it.

Static site built with [VitePress](https://vitepress.dev/), deployed to GitHub Pages at
[intentfile.org](https://intentfile.org).

## Contributing

The specification evolves through pull requests against this repository — see
[CONTRIBUTING.md](CONTRIBUTING.md) for the flow (editorial fixes go straight to a PR;
semantic changes start with a proposal issue). All participation is covered by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Development

```
npm install
npm run docs:dev
```

Access the site at: [http://localhost:7070/](http://localhost:7070/)

## Build and preview locally

```
npm install
npm run docs:build
npm run docs:preview
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yaml`, which builds the site and publishes
it to GitHub Pages. The custom domain is set via the `CNAME` file. Enable **Settings → Pages →
Source: GitHub Actions** on the repository.

## Structure

```
docs/
  index.md            home (hero + features)
  spec/               the specification
    index.md          overview, altitudes, workflow, authoring rules
    entities.md       entities, fields, calculated values, numbering, labels, checks
    relations.md      relations, composition, many-to-many, multi-model
    processes.md      workflows, forms, actions
    presentation.md   reports, charts, widgets, views, printing
    glue.md           declarative glue (notifications ... postings)
    surfaces.md       personal / partner surfaces, permissions
    data.md           seeds, multilingual, naming
  reference.md        one-line-per-construct DSL index
  examples.md         a complete file + a multi-model domain
  manifesto.md        the Intent-Driven Development philosophy
  .vitepress/         config + theme
```
