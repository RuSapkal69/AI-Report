import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  PageBreak,
} from 'docx';

/**
 * Map section level to docx HeadingLevel
 */
const getDocxHeadingLevel = (level) => {
  const mapping = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
  };
  return mapping[level] || HeadingLevel.HEADING_1;
};

/**
 * Parse markdown-style formatting in text
 * **bold** → bold, *italic* → italic
 */
const parseFormattedText = (text) => {
  const runs = [];
  let remaining = text;
  
  // Pattern for bold and italic
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      runs.push(new TextRun(text.substring(lastIndex, match.index)));
    }
    
    // Add formatted text
    if (match[2]) {
      // Bold: **text**
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3]) {
      // Italic: *text*
      runs.push(new TextRun({ text: match[3], italics: true }));
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    runs.push(new TextRun(text.substring(lastIndex)));
  }
  
  // If no formatting found, return simple text run
  if (runs.length === 0) {
    runs.push(new TextRun(text));
  }
  
  return runs;
};

/**
 * Create a paragraph from text content
 */
const createParagraph = (text, options = {}) => {
  const { alignment, spacing, indent } = options;
  
  return new Paragraph({
    children: parseFormattedText(text),
    alignment: alignment || AlignmentType.JUSTIFIED,
    spacing: spacing || { after: 200 },
    indent: indent,
  });
};

/**
 * Create a heading paragraph
 */
const createHeading = (text, level, options = {}) => {
  return new Paragraph({
    text,
    heading: getDocxHeadingLevel(level),
    spacing: { before: 400, after: 200 },
    ...options,
  });
};

/**
 * Create a table from structured data
 * 
 * @param {Object} tableData - { headers: string[], rows: string[][] }
 */
const createTable = (tableData) => {
  const { headers, rows } = tableData;
  
  const tableRows = [];
  
  // Header row
  if (headers && headers.length > 0) {
    tableRows.push(
      new TableRow({
        children: headers.map(
          (header) =>
            new TableCell({
              children: [new Paragraph({ text: header, bold: true })],
              shading: { fill: 'E0E0E0' },
            })
        ),
        tableHeader: true,
      })
    );
  }
  
  // Data rows
  for (const row of rows) {
    tableRows.push(
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ text: cell || '' })],
            })
        ),
      })
    );
  }
  
  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
  });
};

/**
 * Parse simple markdown table to structured data
 * | Header1 | Header2 |
 * | ------- | ------- |
 * | Cell1   | Cell2   |
 */
const parseMarkdownTable = (tableText) => {
  const lines = tableText.trim().split('\n').filter((line) => line.trim());
  
  if (lines.length < 2) return null;
  
  const parseRow = (line) =>
    line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell && !cell.match(/^-+$/));
  
  const headers = parseRow(lines[0]);
  
  // Skip separator line (| --- | --- |)
  const dataStartIndex = lines[1].includes('-') ? 2 : 1;
  
  const rows = lines.slice(dataStartIndex).map(parseRow);
  
  return { headers, rows };
};

/**
 * Convert draft content to DOCX paragraphs
 */
const convertContentToDocx = (content) => {
  const elements = [];
  
  // Split content into paragraphs
  const paragraphs = content.split('\n\n').filter((p) => p.trim());
  
  for (const para of paragraphs) {
    const trimmed = para.trim();
    
    // Check if it's a table
    if (trimmed.includes('|') && trimmed.split('\n').length > 1) {
      const tableData = parseMarkdownTable(trimmed);
      if (tableData) {
        elements.push(createTable(tableData));
        continue;
      }
    }
    
    // Check if it's a list
    if (/^[-*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      const listItems = trimmed.split('\n');
      for (const item of listItems) {
        const text = item.replace(/^[-*\d.]\s*/, '').trim();
        if (text) {
          elements.push(
            new Paragraph({
              children: parseFormattedText(text),
              bullet: { level: 0 },
              spacing: { after: 100 },
            })
          );
        }
      }
      continue;
    }
    
    // Regular paragraph
    elements.push(createParagraph(trimmed));
  }
  
  return elements;
};

/**
 * Generate DOCX document from draft content
 * 
 * @param {Object} draft - Draft object with sections and references
 * @param {Object} template - Template structure for section order
 * @param {Object} options - Export options
 * @returns {Promise<Buffer>} DOCX file as buffer
 */
export const generateDocx = async (draft, template, options = {}) => {
  const {
    title = 'Research Report',
    includeReferences = true,
    includeTableOfContents = false,
  } = options;
  
  const children = [];
  
  // Title
  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );
  
  // Process each section from template structure
  for (const templateSection of template.structure) {
    // Find matching content in draft
    const draftSection = draft.sections?.find(
      (s) =>
        s.templateSectionId === templateSection.id ||
        s.templateSectionTitle === templateSection.title
    );
    
    // Add section heading
    children.push(createHeading(templateSection.title, templateSection.level));
    
    // Add section content
    if (draftSection && draftSection.content) {
      const contentElements = convertContentToDocx(draftSection.content);
      children.push(...contentElements);
    } else {
      // Placeholder for empty sections
      children.push(
        createParagraph('[Content not yet generated]', {
          alignment: AlignmentType.LEFT,
        })
      );
    }
  }
  
  // Add references section
  if (includeReferences && draft.references && draft.references.length > 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(createHeading('References', 1));
    
    for (let i = 0; i < draft.references.length; i++) {
      const ref = draft.references[i];
      const refText = ref.formatted || ref.rawText || `Reference ${i + 1}`;
      
      children.push(
        new Paragraph({
          children: [new TextRun(`[${i + 1}] ${refText}`)],
          spacing: { after: 100 },
          indent: { left: 720, hanging: 720 }, // Hanging indent
        })
      );
    }
  }
  
  // Create document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch in twips
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children,
      },
    ],
    styles: {
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          run: {
            font: 'Times New Roman',
            size: 24, // 12pt in half-points
          },
          paragraph: {
            spacing: { line: 360 }, // 1.5 line spacing
          },
        },
      ],
    },
  });
  
  // Generate buffer
  const buffer = await Packer.toBuffer(doc);
  
  return buffer;
};

/**
 * Generate a simple DOCX with just text content
 * Useful for quick exports or previews
 */
export const generateSimpleDocx = async (content, title = 'Document') => {
  const children = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    ...convertContentToDocx(content),
  ];
  
  const doc = new Document({
    sections: [{ children }],
  });
  
  return await Packer.toBuffer(doc);
};

export default {
  generateDocx,
  generateSimpleDocx,
  createParagraph,
  createHeading,
  createTable,
};