.PHONY: css

css:
	npx --yes tailwindcss@3.4.17 -i ./static/tailwind.css -o ./static/styles.css --minify --content './templates/**/*.html'
