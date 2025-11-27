import axios from 'axios';
import FormData from 'form-data';
import config from '../config/index.js';
import { normalizeWhitespace } from '../utils/helpers.js';

/**
 * Check if GROBID service is available
 */
export const isGrobidAvailable = async () => {
  try {
    const response = await axios.get(`${config.grobid.url}/api/isalive`, {
      timeout: 5000,
    });
    return response.status === 200;
  } catch {
    return false;
  }
};

/**
 * Parse TEI XML response from GROBID to extract metadata
 * This is a simplified parser - GROBID returns complex TEI XML
 */
const parseMetadataFromTei = (teiXml) => {
  const metadata = {
    title: null,
    authors: [],
    abstract: null,
    journal: null,
    year: null,
    doi: null,
    keywords: [],
  };
  
  try {
    // Extract title
    const titleMatch = teiXml.match(/<title[^>]*type="main"[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      metadata.title = normalizeWhitespace(titleMatch[1]);
    }
    
    // Extract authors
    const authorPattern = /<persName[^>]*>([\s\S]*?)<\/persName>/gi;
    let authorMatch;
    while ((authorMatch = authorPattern.exec(teiXml)) !== null) {
      const authorXml = authorMatch[1];
      
      const forenameMatch = authorXml.match(/<forename[^>]*>([^<]+)<\/forename>/i);
      const surnameMatch = authorXml.match(/<surname[^>]*>([^<]+)<\/surname>/i);
      
      const forename = forenameMatch ? forenameMatch[1].trim() : '';
      const surname = surnameMatch ? surnameMatch[1].trim() : '';
      
      if (surname) {
        const fullName = forename ? `${forename} ${surname}` : surname;
        if (!metadata.authors.includes(fullName)) {
          metadata.authors.push(fullName);
        }
      }
    }
    
    // Extract abstract
    const abstractMatch = teiXml.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i);
    if (abstractMatch) {
      // Remove XML tags from abstract content
      const abstractText = abstractMatch[1].replace(/<[^>]+>/g, ' ');
      metadata.abstract = normalizeWhitespace(abstractText);
    }
    
    // Extract DOI
    const doiMatch = teiXml.match(/<idno type="DOI"[^>]*>([^<]+)<\/idno>/i);
    if (doiMatch) {
      metadata.doi = doiMatch[1].trim();
    }
    
    // Extract journal/publication info
    const journalMatch = teiXml.match(/<title[^>]*level="j"[^>]*>([^<]+)<\/title>/i);
    if (journalMatch) {
      metadata.journal = normalizeWhitespace(journalMatch[1]);
    }
    
    // Extract year
    const yearMatch = teiXml.match(/<date[^>]*when="(\d{4})/i);
    if (yearMatch) {
      metadata.year = parseInt(yearMatch[1], 10);
    }
    
    // Extract keywords
    const keywordPattern = /<term[^>]*>([^<]+)<\/term>/gi;
    let keywordMatch;
    while ((keywordMatch = keywordPattern.exec(teiXml)) !== null) {
      const keyword = normalizeWhitespace(keywordMatch[1]);
      if (keyword && !metadata.keywords.includes(keyword)) {
        metadata.keywords.push(keyword);
      }
    }
    
  } catch (error) {
    console.error('Error parsing TEI metadata:', error);
  }
  
  return metadata;
};

/**
 * Parse references from GROBID TEI XML
 */
const parseReferencesFromTei = (teiXml) => {
  const references = [];
  
  try {
    // Find all biblStruct elements (each represents a reference)
    const biblPattern = /<biblStruct[^>]*>([\s\S]*?)<\/biblStruct>/gi;
    let biblMatch;
    let refIndex = 1;
    
    while ((biblMatch = biblPattern.exec(teiXml)) !== null) {
      const biblXml = biblMatch[1];
      const ref = {
        id: `ref_${refIndex}`,
        index: refIndex,
        authors: [],
        title: null,
        year: null,
        journal: null,
        volume: null,
        pages: null,
        doi: null,
        rawText: null,
      };
      
      // Extract reference title
      const titleMatch = biblXml.match(/<title[^>]*level="a"[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        ref.title = normalizeWhitespace(titleMatch[1]);
      }
      
      // Extract authors
      const authorPattern = /<persName[^>]*>([\s\S]*?)<\/persName>/gi;
      let authorMatch;
      while ((authorMatch = authorPattern.exec(biblXml)) !== null) {
        const authorXml = authorMatch[1];
        const forenameMatch = authorXml.match(/<forename[^>]*>([^<]+)<\/forename>/i);
        const surnameMatch = authorXml.match(/<surname[^>]*>([^<]+)<\/surname>/i);
        
        const forename = forenameMatch ? forenameMatch[1].trim() : '';
        const surname = surnameMatch ? surnameMatch[1].trim() : '';
        
        if (surname) {
          ref.authors.push(forename ? `${forename} ${surname}` : surname);
        }
      }
      
      // Extract year
      const yearMatch = biblXml.match(/<date[^>]*when="(\d{4})/i);
      if (yearMatch) {
        ref.year = parseInt(yearMatch[1], 10);
      }
      
      // Extract journal
      const journalMatch = biblXml.match(/<title[^>]*level="j"[^>]*>([^<]+)<\/title>/i);
      if (journalMatch) {
        ref.journal = normalizeWhitespace(journalMatch[1]);
      }
      
      // Extract volume
      const volumeMatch = biblXml.match(/<biblScope[^>]*unit="volume"[^>]*>([^<]+)<\/biblScope>/i);
      if (volumeMatch) {
        ref.volume = volumeMatch[1].trim();
      }
      
      // Extract pages
      const pagesMatch = biblXml.match(/<biblScope[^>]*unit="page"[^>]*>([^<]+)<\/biblScope>/i);
      if (pagesMatch) {
        ref.pages = pagesMatch[1].trim();
      }
      
      // Extract DOI
      const doiMatch = biblXml.match(/<idno type="DOI"[^>]*>([^<]+)<\/idno>/i);
      if (doiMatch) {
        ref.doi = doiMatch[1].trim();
      }
      
      // Build raw text citation
      const authorStr = ref.authors.length > 0 
        ? ref.authors.join(', ') 
        : 'Unknown';
      const yearStr = ref.year || 'n.d.';
      const titleStr = ref.title || 'Untitled';
      const journalStr = ref.journal ? `. ${ref.journal}` : '';
      const volumeStr = ref.volume ? `, ${ref.volume}` : '';
      const pagesStr = ref.pages ? `, ${ref.pages}` : '';
      
      ref.rawText = `${authorStr} (${yearStr}). ${titleStr}${journalStr}${volumeStr}${pagesStr}.`;
      
      references.push(ref);
      refIndex++;
    }
    
  } catch (error) {
    console.error('Error parsing references:', error);
  }
  
  return references;
};

/**
 * Process PDF with GROBID to extract metadata and references
 * 
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @returns {Promise<Object>} Extracted metadata and references
 */
export const processWithGrobid = async (pdfBuffer) => {
  const warnings = [];
  
  // Check if GROBID is available
  const available = await isGrobidAvailable();
  if (!available) {
    warnings.push('GROBID service is not available. Metadata and references could not be extracted.');
    return {
      success: false,
      warnings,
      metadata: null,
      references: [],
    };
  }
  
  try {
    // Create form data with PDF
    const formData = new FormData();
    formData.append('input', pdfBuffer, {
      filename: 'document.pdf',
      contentType: 'application/pdf',
    });
    
    // Call GROBID processFulltextDocument endpoint
    const response = await axios.post(
      `${config.grobid.url}/api/processFulltextDocument`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: config.grobid.timeout,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
    
    if (response.status !== 200) {
      warnings.push(`GROBID returned status ${response.status}`);
      return {
        success: false,
        warnings,
        metadata: null,
        references: [],
      };
    }
    
    const teiXml = response.data;
    
    // Parse metadata and references from TEI XML
    const metadata = parseMetadataFromTei(teiXml);
    const references = parseReferencesFromTei(teiXml);
    
    // Add warnings for missing data
    if (!metadata.title) {
      warnings.push('Could not extract document title.');
    }
    
    if (metadata.authors.length === 0) {
      warnings.push('Could not extract author information.');
    }
    
    if (references.length === 0) {
      warnings.push('No references were extracted.');
    }
    
    return {
      success: true,
      warnings,
      metadata,
      references,
      rawTei: teiXml, // Keep raw TEI for debugging
    };
    
  } catch (error) {
    console.error('GROBID processing error:', error);
    
    let errorMessage = 'GROBID processing failed';
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Could not connect to GROBID service';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'GROBID request timed out';
    } else if (error.response) {
      errorMessage = `GROBID error: ${error.response.status}`;
    }
    
    warnings.push(errorMessage);
    
    return {
      success: false,
      warnings,
      metadata: null,
      references: [],
    };
  }
};

/**
 * Extract only references from a PDF using GROBID
 * Lighter weight than full document processing
 */
export const extractReferences = async (pdfBuffer) => {
  const available = await isGrobidAvailable();
  if (!available) {
    return { success: false, references: [], error: 'GROBID not available' };
  }
  
  try {
    const formData = new FormData();
    formData.append('input', pdfBuffer, {
      filename: 'document.pdf',
      contentType: 'application/pdf',
    });
    
    const response = await axios.post(
      `${config.grobid.url}/api/processReferences`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: config.grobid.timeout,
      }
    );
    
    const references = parseReferencesFromTei(response.data);
    
    return {
      success: true,
      references,
    };
    
  } catch (error) {
    console.error('GROBID reference extraction error:', error);
    return {
      success: false,
      references: [],
      error: error.message,
    };
  }
};

export default {
  isGrobidAvailable,
  processWithGrobid,
  extractReferences,
};