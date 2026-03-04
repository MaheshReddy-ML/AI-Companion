export default function FileUploadButton({ onFileSelect }) {
  return (
    <>
      <label className="cursor-pointer text-xl px-2">
        ➕
        <input
          type="file"
          hidden
          accept="image/*,.pdf,.doc,.docx"
          onChange={(e) => onFileSelect(e.target.files[0])}
        />
      </label>
    </>
  );
}
