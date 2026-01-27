import * as fs from "fs";

async function loadGoogleFont(
  font: string,
  text: string,
  weight: number
): Promise<ArrayBuffer> {
  const API = `https://fonts.googleapis.com/css2?family=${font}:wght@${weight}&text=${encodeURIComponent(text)}`;

  try {
    const css = await (
      await fetch(API, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
        },
      })
    ).text();

    const resource = css.match(
      /src: url\((.+?)\) format\('(opentype|truetype)'\)/
    );

    if (!resource) throw new Error("Failed to download dynamic font");

    const res = await fetch(resource[1]);

    if (!res.ok) {
      throw new Error("Failed to download dynamic font. Status: " + res.status);
    }

    return res.arrayBuffer();
  } catch (error) {
    console.warn(`Failed to load Google Font: ${font}, using system font fallback`, error);
    // Try to load a fallback system font
    try {
      // Use DejaVu Sans as fallback (available in most Linux systems)
      const fontPath = weight >= 700 
        ? "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
      
      if (fs.existsSync(fontPath)) {
        return fs.readFileSync(fontPath).buffer;
      }
    } catch (fsError) {
      console.warn("Failed to load system font:", fsError);
    }
    // Return an empty ArrayBuffer as last resort
    return new ArrayBuffer(0);
  }
}

async function loadGoogleFonts(
  text: string
): Promise<
  Array<{ name: string; data: ArrayBuffer; weight: number; style: string }>
> {
  const fontsConfig = [
    {
      name: "M PLUS 1p",
      font: "M+PLUS+1p",
      weight: 400,
      style: "normal",
    },
    {
      name: "M PLUS 1p",
      font: "M+PLUS+1p",
      weight: 700,
      style: "bold",
    },
  ];

  const fonts = await Promise.all(
    fontsConfig.map(async ({ name, font, weight, style }) => {
      const data = await loadGoogleFont(font, text, weight);
      return { name, data, weight, style };
    })
  );

  // Filter out fonts that failed to load (empty ArrayBuffer)
  return fonts.filter(font => font.data.byteLength > 0);
}

export default loadGoogleFonts;
