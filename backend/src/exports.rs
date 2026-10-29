//! CSV and XLSX writers for staff exports. Callers neutralise formula cells before passing them in.

use rust_xlsxwriter::{Format, Workbook};

pub fn csv(headers: &[&str], rows: &[Vec<String>]) -> anyhow::Result<Vec<u8>> {
    // UTF-8 BOM so Excel shows Marathi text and ₹ correctly.
    let mut out = vec![0xEF, 0xBB, 0xBF];
    {
        let mut w = csv::Writer::from_writer(&mut out);
        w.write_record(headers)?;
        for r in rows {
            w.write_record(r)?;
        }
        w.flush()?;
    }
    Ok(out)
}

pub fn xlsx(sheet: &str, headers: &[&str], rows: &[Vec<String>]) -> anyhow::Result<Vec<u8>> {
    let mut book = Workbook::new();
    let ws = book.add_worksheet();
    ws.set_name(sheet)?;
    let bold = Format::new().set_bold();
    for (c, h) in headers.iter().enumerate() {
        ws.write_string_with_format(0, c as u16, *h, &bold)?;
        ws.set_column_width(c as u16, 18)?;
    }
    for (r, row) in rows.iter().enumerate() {
        for (c, cell) in row.iter().enumerate() {
            // Always written as text: values are never interpreted as formulas.
            ws.write_string((r + 1) as u32, c as u16, cell)?;
        }
    }
    ws.set_freeze_panes(1, 0)?;
    Ok(book.save_to_buffer()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_has_bom_and_rows() {
        let out = csv(&["A", "B"], &[vec!["1".into(), "'=x".into()]]).unwrap();
        let s = String::from_utf8(out[3..].to_vec()).unwrap();
        assert_eq!(s, "A,B\n1,'=x\n");
    }

    #[test]
    fn xlsx_builds() {
        let out = xlsx("Leads", &["Ref"], &[vec!["LMS-2026-00001".into()]]).unwrap();
        assert_eq!(&out[..2], b"PK");
    }
}
