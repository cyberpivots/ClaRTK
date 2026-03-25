use std::path::{Path, PathBuf};

pub fn rtklib_present() -> bool {
    option_env!("CLARTK_RTKLIB_PRESENT").is_some()
}

pub fn rtklib_root(manifest_dir: &Path) -> PathBuf {
    manifest_dir.join("../../../third_party/rtklib")
}

