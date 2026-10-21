# models/

Local speech models live here: Piper voices (text-to-speech, used offline to generate
lesson audio) and Vosk models (speech recognition for `speak` exercises).

Everything in this directory except this README is gitignored. Models are downloaded by
`scripts/fetch-models.sh`, never at runtime, and never loaded from the internet by the app.
